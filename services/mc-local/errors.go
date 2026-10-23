package main

import (
	"errors"
	"net/http"
)

// statusError is an error that already knows its HTTP status. Handlers turn it
// into the matching API error; anything else becomes a 500.
type statusError struct {
	Status  int
	Message string
	Data    map[string]any
}

func (e *statusError) Error() string { return e.Message }

func statusErr(status int, message string) *statusError {
	return &statusError{Status: status, Message: message}
}

func statusOf(err error) (*statusError, bool) {
	var se *statusError
	if errors.As(err, &se) {
		return se, true
	}
	return nil, false
}

var errInternal = statusErr(http.StatusInternalServerError, "Something went wrong inside the editor's local service.")
