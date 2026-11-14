package game

import (
	"math/rand"
	"strings"
	"testing"
)

func TestChapterFourOpensTheRooms(t *testing.T) {
	if RoomsStep >= len(MainQuests) || MainQuests[RoomsStep].ID != "into_the_hall" || MainQuests[RoomsStep].Chapter != 4 {
		t.Fatalf("RoomsStep is not the first step of chapter 4: %+v", MainQuests[RoomsStep])
	}
	if MainQuests[RoomsStep-1].ID != "hall_rooms" {
		t.Fatalf("chapter 4 does not follow the Word Hall's story: %s", MainQuests[RoomsStep-1].ID)
	}
	for _, r := range Rooms {
		found := false
		for _, s := range MainQuests[RoomsStep:] {
			found = found || (s.Counter.Item == "room_done" && s.Counter.Of == r.ID)
		}
		if !found {
			t.Errorf("no step of chapter 4 asks for the %s", r.ID)
		}
	}
}

func TestEveryRoomIsThreeBundlesOfFourWords(t *testing.T) {
	if len(Rooms) != RoomCount {
		t.Fatalf("%d rooms, want %d", len(Rooms), RoomCount)
	}
	seen := map[string]bool{}
	bundles := map[string]bool{}
	r := rand.New(rand.NewSource(1))
	for _, room := range Rooms {
		if len(room.Bundles) != 3 || room.Icon == "" || room.Name.Vi == "" || room.Lexi.Vi == "" {
			t.Errorf("%s: %d bundles, or something unnamed", room.ID, len(room.Bundles))
		}
		pool := RoomEntries(room)
		for _, b := range room.Bundles {
			if bundles[b.ID] || len(b.Words) != 4 || b.Name.Vi == "" {
				t.Errorf("bundle %s: %d words, or used twice", b.ID, len(b.Words))
			}
			bundles[b.ID] = true
			for _, w := range b.Words {
				if seen[w.Word] || w.IPA == "" || w.Vi == "" {
					t.Errorf("%s: twice, or without its sound or meaning", w.Word)
				}
				seen[w.Word] = true
				// Every word can be asked, by its own way and both others.
				target := Entry{Word: w.Word, IPA: w.IPA, Meaning: w.Vi, Sentence: w.Sentence, SentenceVi: w.SentenceVi}
				if _, ok := NewQuestion(RoomGame("u", w), target, pool, r); !ok {
					t.Errorf("%s cannot be asked as %s", w.Word, RoomGame("u", w))
				}
				// Upstairs, every word has a sentence it fits the gap of, and
				// a meaning for the sentence.
				if room.Upstairs != (w.Sentence != "") {
					t.Errorf("%s: a sentence downstairs, or none upstairs", w.Word)
				}
				if room.Upstairs {
					q, ok := NewQuestion(GameCloze, target, pool, r)
					if !ok || w.SentenceVi == "" || strings.Count(q.Prompt, Gap) != 1 || q.Hint != w.SentenceVi {
						t.Errorf("%s cannot be left out of %q: %+v", w.Word, w.Sentence, q)
					}
				}
				if _, ok := NewQuestion(GameListen, target, pool, r); !ok {
					t.Errorf("%s cannot be heard among its room's words", w.Word)
				}
				if room2, b2, w2, ok := WordInRooms(w.Word); !ok || room2.ID != room.ID || b2.ID != b.ID || w2 != w {
					t.Errorf("%s is not found where it is", w.Word)
				}
			}
		}
	}
}

func TestARoomWordIsAskedTheSameWayEachTime(t *testing.T) {
	kinds := map[bool]map[string]int{false: {}, true: {}}
	for _, room := range Rooms {
		for _, b := range room.Bundles {
			for _, w := range b.Words {
				k := RoomGame("someone", w)
				if k != RoomGame("someone", w) {
					t.Fatalf("%s is asked two ways", w.Word)
				}
				kinds[room.Upstairs][k]++
			}
		}
	}
	down, up := kinds[false], kinds[true]
	if down[GameListen] == 0 || down[GameScramble] == 0 || down[GameCloze] != 0 {
		t.Fatalf("downstairs asks %v", down)
	}
	if up[GameCloze] == 0 || up[GameListen]+up[GameScramble] == 0 {
		t.Fatalf("upstairs asks %v", up)
	}
}

func TestTheUpstairsRoomsOpenOnceHalfTheHallIsAwake(t *testing.T) {
	if MainQuests[UpstairsStep].ID != "upstairs" || MainQuests[UpstairsStep-1].ID != "half_the_hall" {
		t.Fatalf("UpstairsStep is %s", MainQuests[UpstairsStep].ID)
	}
	upstairs := 0
	for i, r := range Rooms {
		if r.Upstairs {
			upstairs++
		} else if upstairs > 0 {
			t.Errorf("%s is downstairs after a room upstairs", Rooms[i].ID)
		}
	}
	if upstairs != 3 {
		t.Fatalf("%d rooms upstairs", upstairs)
	}
	// The chapter ends on the hall singing, and the road beyond it.
	last := MainQuests[len(MainQuests)-2:]
	if last[0].ID != "hall_sings" || last[0].Reward.Items["keeper_badge"] != 1 || last[1].ID != "beyond_the_hall" {
		t.Fatalf("the chapter ends on %s, %s", last[0].ID, last[1].ID)
	}
	if _, ok := ItemByID("keeper_badge"); !ok {
		t.Fatal("no Word Keeper's badge")
	}
}

func TestAGapIsTheWholeWordOnce(t *testing.T) {
	for _, c := range []struct{ sentence, word, want string }{
		{"Sorry, the bus is late again.", "late", "Sorry, the bus is _____ again."},
		{"I'll send it later, not late.", "late", "I'll send it later, not _____."},
		{"Turn Left at the bank.", "left", "Turn _____ at the bank."},
	} {
		got, ok := Blank(c.sentence, c.word)
		if !ok || got != c.want {
			t.Errorf("%q without %q: %q", c.sentence, c.word, got)
		}
	}
	if _, ok := Blank("Nothing here.", "late"); ok {
		t.Error("a gap where the word is not")
	}
}

func TestTheRoomsTaskIsOnlyDrawnOnceTheRoomsAreOpen(t *testing.T) {
	for d := 0; d < 60; d++ {
		day := "2026-11-" + string(rune('a'+d%26)) + string(rune('a'+d/26))
		for _, task := range DailyFor("p", day, Open{Woods: true, Town: true, Glasses: true, Library: true}) {
			if task.ID == "rooms2" {
				t.Fatalf("the rooms' task before the rooms are open, on %s", day)
			}
		}
	}
}
