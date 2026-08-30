package metrics

import "testing"

func TestCommandSignatureOmitsFileArguments(t *testing.T) {
	signature, ok := CommandSignatureFor([]string{"cat", "photo_1.jpg"})
	if !ok || signature.Executable != "cat" || signature.Subcommand != "" {
		t.Fatalf("cat signature = %#v, ok = %t", signature, ok)
	}
}

func TestCommandSignatureKeepsKnownSubcommands(t *testing.T) {
	signature, ok := CommandSignatureFor([]string{"git", "status"})
	if !ok || signature.Executable != "git" || signature.Subcommand != "status" {
		t.Fatalf("git signature = %#v, ok = %t", signature, ok)
	}
}