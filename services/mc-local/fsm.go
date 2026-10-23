package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	_ "embed"
)

// The status moves a document may make. Embedded at build time, so a broken
// file stops the service at start instead of at the first save.
//
//go:embed schema/status_transitions.json
var statusRulesJSON []byte

type statusRules struct {
	Statuses    []string            `json:"statuses"`
	Transitions map[string][]string `json:"transitions"`
}

var rules = mustParseRules(statusRulesJSON)

func mustParseRules(raw []byte) *statusRules {
	r, err := parseRules(raw)
	if err != nil {
		panic("schema/status_transitions.json: " + err.Error())
	}
	return r
}

func parseRules(raw []byte) (*statusRules, error) {
	var r statusRules
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, err
	}
	if len(r.Statuses) == 0 {
		return nil, errors.New("no statuses listed")
	}
	for from, targets := range r.Transitions {
		if !slices.Contains(r.Statuses, from) {
			return nil, fmt.Errorf("transition from unknown status %q", from)
		}
		for _, to := range targets {
			if !slices.Contains(r.Statuses, to) {
				return nil, fmt.Errorf("transition to unknown status %q", to)
			}
		}
	}
	return &r, nil
}

// checkTransition allows: no change; any known status as the first one; and
// the moves listed in status_transitions.json. Everything else is a 422.
func checkTransition(from, to string) error {
	if from == to {
		return nil
	}
	if to == "" {
		return statusErr(422, fmt.Sprintf("The status can't be removed once it is set (it is %q).", from))
	}
	if !slices.Contains(rules.Statuses, to) {
		return statusErr(422, fmt.Sprintf("%q isn't a status. Use one of: %s.", to, strings.Join(rules.Statuses, ", ")))
	}
	if from == "" {
		return nil
	}
	allowed := rules.Transitions[from]
	if slices.Contains(allowed, to) {
		return nil
	}
	msg := fmt.Sprintf("A %s document can't become %s.", from, to)
	if len(allowed) == 0 {
		msg += " Its status can't change any more."
	} else {
		msg += " It can become: " + strings.Join(allowed, ", ") + "."
	}
	return statusErr(422, msg)
}
