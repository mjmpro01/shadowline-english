package game

import (
	"math/rand"
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
	if len(Rooms) == 0 || len(Rooms) > RoomCount {
		t.Fatalf("%d rooms", len(Rooms))
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
				target := Entry{Word: w.Word, IPA: w.IPA, Meaning: w.Vi}
				if _, ok := NewQuestion(RoomGame("u", w.Word), target, pool, r); !ok {
					t.Errorf("%s cannot be asked as %s", w.Word, RoomGame("u", w.Word))
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
	kinds := map[string]int{}
	for _, room := range Rooms {
		for _, e := range RoomEntries(room) {
			k := RoomGame("someone", e.Word)
			if k != RoomGame("someone", e.Word) {
				t.Fatalf("%s is asked two ways", e.Word)
			}
			kinds[k]++
		}
	}
	if kinds[GameListen] == 0 || kinds[GameScramble] == 0 {
		t.Fatalf("the rooms ask only one way: %v", kinds)
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
