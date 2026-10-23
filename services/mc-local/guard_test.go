package main

import "testing"

func TestOnlyThisPCIsAllowed(t *testing.T) {
	cases := map[string]bool{
		"127.0.0.1:8090":          true,
		"localhost:8090":          true,
		"127.0.0.1":               true,
		"evil.com:8090":           false,
		"127.0.0.1.evil.com:8090": false,
		"10.0.0.5:8090":           false,
	}
	for host, want := range cases {
		if got := isLocalHost(host); got != want {
			t.Errorf("isLocalHost(%q) = %v, want %v", host, got, want)
		}
	}
}

func TestTokenIsCheckedInConstantTime(t *testing.T) {
	g := &guard{}
	if g.tokenMatches("anything") {
		t.Fatal("no token configured: nothing should match")
	}
	g.setToken("0123456789abcdef0123456789abcdef")
	if !g.tokenMatches("0123456789abcdef0123456789abcdef") {
		t.Fatal("the right token should match")
	}
	if g.tokenMatches("") || g.tokenMatches("0123456789abcdef0123456789abcdee") {
		t.Fatal("wrong or empty token should not match")
	}
}
