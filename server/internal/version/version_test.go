package version

import "testing"

func TestTheVersionComesFromTheFirstSourceThatHasOne(t *testing.T) {
	none := func() string { return "" }
	env := func(v string) func(string) string { return func(string) string { return v } }

	cases := []struct {
		name  string
		env   string
		build string
		git   string
		want  string
	}{
		{"pinned by the deployment", "deadbee", "1111111", "2222222", "deadbee"},
		{"recorded by go build", "", "1111111", "2222222", "1111111"},
		{"asked of git, for go run", "", "", "2222222-dirty", "2222222-dirty"},
		{"nothing to go on", "", "", "", "unknown"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			build := func() string { return c.build }
			git := func() string { return c.git }
			if c.build == "" {
				build = none
			}
			if got := resolve(env(c.env), build, git); got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}

func TestACommitIsSevenCharactersAndSaysWhenItIsDirty(t *testing.T) {
	if got := short("0123456789abcdef", false); got != "0123456" {
		t.Fatalf("got %q", got)
	}
	if got := short("0123456789abcdef", true); got != "0123456-dirty" {
		t.Fatalf("got %q", got)
	}
	if got := short("", false); got != "" {
		t.Fatalf("an empty revision gave %q", got)
	}
}

// From the repository these tests run in, git knows the commit.
func TestTheCheckoutsCommitIsFound(t *testing.T) {
	if got := gitCommit(); len(got) < 7 {
		t.Skipf("no git here (%q)", got)
	}
}
