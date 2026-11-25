# Prompt tạo hình 24 nhân vật Đấu trường

Mỗi nhân vật là một hình vẽ nguyên con, cầm sẵn vũ khí, với 26 frame. Cách đặt file và
kiểm tra: [`arena-sprites.md`](arena-sprites.md). Khung mẫu:
[`arena/character-template.png`](arena/character-template.png).

## Cách làm

```
BỘ PROMPT 24 NHÂN VẬT ĐẤU TRƯỜNG

Mỗi nhân vật là MỘT hình vẽ nguyên con (không ghép lớp), cầm sẵn vũ khí,
có 26 frame: idle 1-4, light 1-4, heavy 1-4, hit 1-2, ko 1-4, win 1-4,
skill 1-4 (tuyệt chiêu riêng).

CÁCH LÀM VỚI CHATGPT
1) CHỐT THIẾT KẾ: dán lần lượt 01-lineup-*.txt (4 bậc, mỗi bậc 6 người).
   Gửi 4 ảnh lineup cho Claude xem trước. Ai chưa ưng thì gen lại riêng người đó.
2) TỪNG NHÂN VẬT: mở chat mới cho mỗi nhân vật, tải lên
   (a) ảnh nhân vật đó cắt từ lineup, (b) character-template.png,
   rồi dán prompt trong 02-nhan-vat/<mã>.txt.
   Nếu ảnh ra lệch (người to nhỏ khác nhau, tràn ô): nhắc lại
   "same size in every cell, feet on the dashed line, stay inside the cell".
3) GỬI ẢNH CHO CLAUDE: Claude cắt nền, căn chân, ghép sheet và kiểm tra.
   Nên gửi theo thứ tự: 2 nhân vật khởi đầu (beggar, street_kid) trước,
   rồi các đối thủ ở tháp (xem bảng trong 00-danh-sach.txt).

Chưa có hình thì nhân vật vẫn chơi được, vẽ tạm bằng hình đơn giản theo màu của họ.
Không vẽ nhân vật giống game khác.
```

## Danh sách

```
DANH SÁCH 24 NHÂN VẬT

THƯỜNG (Common)
  beggar          Kẻ ăn mày / Beggar · nam · bare fists wrapped in dirty cloth strips · tuyệt chiêu Cú đấm liều mạng (Đòn chí mạng) · miễn phí
  street_kid      Nhóc đường phố / Street Kid · nữ · a wooden slingshot and a pouch of pebbles · tuyệt chiêu Ngắm chuẩn (Tập trung) · miễn phí
  fisherman       Ngư phủ / Fisherman · nam · a long wooden oar · tuyệt chiêu Mái chèo quật sóng (Choáng) · 150 xu
  farmer          Nông dân / Farmer · nữ · a curved sickle · tuyệt chiêu Gặt lúa (Liên hoàn) · 200 xu
  porter          Phu khuân vác / Porter · nam · a bamboo carrying pole · tuyệt chiêu Gánh sức (Hút máu) · 250 xu
  herb_girl       Cô hái thuốc / Herb Gatherer · nữ · a bottle gourd and a bundle of herbs · tuyệt chiêu Thuốc tiên (Hồi máu) · 350 xu

HIẾM (Rare)
  stick_fighter   Võ sĩ gậy / Stick Fighter · nam · a long wooden bo staff · tuyệt chiêu Gậy liên hoàn (Liên hoàn) · 700 xu
  temple_monk     Nhà sư / Temple Monk · nam · wooden prayer beads and open palms · tuyệt chiêu Tâm an (Hồi máu) · 800 xu
  fan_dancer      Vũ nữ quạt sắt / Iron Fan Dancer · nữ · a pair of folding steel war fans · tuyệt chiêu Vũ điệu hoa (Choáng) · 850 xu
  forest_archer   Cung thủ rừng / Forest Archer · nữ · a wooden longbow and a quiver of arrows · tuyệt chiêu Mắt diều hâu (Tập trung) · 900 xu
  blacksmith      Thợ rèn / Blacksmith · nam · a heavy forge hammer · tuyệt chiêu Búa nung đỏ (Đòn chí mạng) · 1000 xu
  rope_dart       Hiệp khách phi tiêu / Rope Dart Wanderer · nam · a rope dart: a small blade on a long red rope · tuyệt chiêu Móc dây (Hút máu) · 1100 xu

SỬ THI (Epic)
  swordswoman     Nữ kiếm khách / Swordswoman · nữ · a straight double-edged sword with a blue tassel · tuyệt chiêu Kiếm vũ ba thức (Liên hoàn) · 1800 xu
  spear_guard     Vệ binh giáo / Spear Guard · nam · a long spear with a red tassel · tuyệt chiêu Thương xuyên giáp (Choáng) · 1900 xu
  twin_sabre      Song đao nữ / Twin Sabre · nữ · two curved sabres · tuyệt chiêu Song đao huyết (Hút máu) · 2100 xu
  chain_whip      Roi xích / Chain Whip · nam · a nine-section steel chain whip · tuyệt chiêu Xích long (Đòn chí mạng) · 2200 xu
  war_drummer     Chiến binh trống / War Drummer · nam · two drum mallets, with a small war drum on his back · tuyệt chiêu Trống trận (Hồi máu) · 2400 xu
  shadow_runner   Kẻ chạy bóng / Shadow Runner · nữ · two short knives and a smoke pouch · tuyệt chiêu Ẩn bóng (Tập trung) · 2600 xu

HUYỀN THOẠI (Legendary)
  thunder_monk    Sư sấm / Thunder Monk · nam · an iron staff crackling with lightning · tuyệt chiêu Lôi thần trượng (Đòn chí mạng) · 4000 xu
  phoenix_archer  Cung thủ phượng / Phoenix Archer · nữ · a red-and-gold bow · tuyệt chiêu Tên phượng hoàng (Hút máu) · 4400 xu
  jade_general    Tướng ngọc / Jade General · nam · a halberd with a jade-green blade · tuyệt chiêu Ngọc trấn sơn (Choáng) · 4800 xu
  wind_sage       Hiền giả gió / Wind Sage · nữ · a large white feather fan · tuyệt chiêu Gió lặng (Tập trung) · 5200 xu
  dragon_dancer   Vũ sư rồng / Dragon Dancer · nam · a staff topped with a carved dragon head · tuyệt chiêu Rồng múa (Liên hoàn) · 5600 xu
  tower_master    Chủ tháp / Tower Master · nam · a pair of hook swords · tuyệt chiêu Tâm pháp (Hồi máu) · 6000 xu

THÁP 15 TẦNG (đối thủ là chính các nhân vật này):
  tầng  1: porter
  tầng  2: fisherman
  tầng  3: farmer
  tầng  4: stick_fighter
  tầng  5: blacksmith (trùm)
  tầng  6: temple_monk
  tầng  7: rope_dart
  tầng  8: fan_dancer
  tầng  9: spear_guard
  tầng 10: jade_general (trùm)
  tầng 11: shadow_runner
  tầng 12: swordswoman
  tầng 13: mirror = bóng của chính người chơi
  tầng 14: thunder_monk
  tầng 15: tower_master (trùm)
```

## 1. Chốt thiết kế: lineup từng bậc

### Thường (Common)

```
LINEUP: COMMON TIER (Thường)

Tải lên: không cần. Dán prompt dưới đây vào ChatGPT (tạo ảnh).
Khi có ảnh, gửi lại Claude để chốt thiết kế trước khi làm từng nhân vật.

--- PROMPT ---
A character lineup sheet in this style: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).

Six fighters stand side by side in one row, evenly spaced, all the same height scale, each in a fighting-guard stance facing right and holding their weapon, feet on one shared ground line. Under each fighter a small label with their name. Wide image, nothing overlapping.

1) "Beggar" — a man: a lean young man with messy dark hair, a torn and patched brown shirt, a rope belt, ragged dark shorts, barefoot. Weapon: bare fists wrapped in dirty cloth strips.
2) "Street Kid" — a woman: a teenage girl with a short messy bob, an oversized faded blue jacket, rolled-up brown trousers and sandals. Weapon: a wooden slingshot and a pouch of pebbles.
3) "Fisherman" — a man: a stocky middle-aged man with a short beard, an indigo work shirt, rolled-up trousers and a fishing net over one shoulder. Weapon: a long wooden oar.
4) "Farmer" — a woman: a sturdy young woman with a patterned headscarf, a brown work blouse, green trousers rolled to the knee and bare feet. Weapon: a curved sickle.
5) "Porter" — a man: a broad-shouldered man with a sleeveless grey vest, a towel around his neck, brown trousers and straw sandals. Weapon: a bamboo carrying pole.
6) "Herb Gatherer" — a woman: a slim girl with a long braid, a light green tunic, wide cream trousers and a small woven basket on her back. Weapon: a bottle gourd and a bundle of herbs.
```

### Hiếm (Rare)

```
LINEUP: RARE TIER (Hiếm)

Tải lên: không cần. Dán prompt dưới đây vào ChatGPT (tạo ảnh).
Khi có ảnh, gửi lại Claude để chốt thiết kế trước khi làm từng nhân vật.

--- PROMPT ---
A character lineup sheet in this style: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).

Six fighters stand side by side in one row, evenly spaced, all the same height scale, each in a fighting-guard stance facing right and holding their weapon, feet on one shared ground line. Under each fighter a small label with their name. Wide image, nothing overlapping.

1) "Stick Fighter" — a man: a wiry man with short hair, a sleeveless black tunic, a red waist sash and wrapped shins. Weapon: a long wooden bo staff.
2) "Temple Monk" — a man: a calm shaved-head monk in an ochre robe draped over one shoulder, cloth leg wraps and sandals. Weapon: wooden prayer beads and open palms.
3) "Iron Fan Dancer" — a woman: an elegant woman with a hair bun held by a pin, a purple dress with side slits over black leggings and a pink sash. Weapon: a pair of folding steel war fans.
4) "Forest Archer" — a woman: a lean woman in a hooded green cloak, a leather bracer, brown leggings and soft boots. Weapon: a wooden longbow and a quiver of arrows.
5) "Blacksmith" — a man: a broad man with a soot-smudged face, a headband, a leather apron over bare arms and thick gloves. Weapon: a heavy forge hammer.
6) "Rope Dart Wanderer" — a man: a slim young man in dark teal travelling clothes, a scarf around his neck and wrapped forearms. Weapon: a rope dart: a small blade on a long red rope.
```

### Sử thi (Epic)

```
LINEUP: EPIC TIER (Sử thi)

Tải lên: không cần. Dán prompt dưới đây vào ChatGPT (tạo ảnh).
Khi có ảnh, gửi lại Claude để chốt thiết kế trước khi làm từng nhân vật.

--- PROMPT ---
A character lineup sheet in this style: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).

Six fighters stand side by side in one row, evenly spaced, all the same height scale, each in a fighting-guard stance facing right and holding their weapon, feet on one shared ground line. Under each fighter a small label with their name. Wide image, nothing overlapping.

1) "Swordswoman" — a woman: a poised woman with a long high ponytail, sky-blue and white layered robes and a dark belt. Weapon: a straight double-edged sword with a blue tassel.
2) "Spear Guard" — a man: a tall soldier in bronze lamellar armour, a red under-robe and a round helmet. Weapon: a long spear with a red tassel.
3) "Twin Sabre" — a woman: a fierce woman with short spiky hair, a crimson vest, black trousers and wrapped forearms. Weapon: two curved sabres.
4) "Chain Whip" — a man: a muscular man with shaved sides and a short topknot, a grey-blue tunic and metal bracers. Weapon: a nine-section steel chain whip.
5) "War Drummer" — a man: a big bearded man in a red-brown vest, gold armbands and wide dark trousers. Weapon: two drum mallets, with a small war drum on his back.
6) "Shadow Runner" — a woman: a slim woman in a dark charcoal hooded wrap, a cloth over her mouth and a long purple scarf. Weapon: two short knives and a smoke pouch.
```

### Huyền thoại (Legendary)

```
LINEUP: LEGENDARY TIER (Huyền thoại)

Tải lên: không cần. Dán prompt dưới đây vào ChatGPT (tạo ảnh).
Khi có ảnh, gửi lại Claude để chốt thiết kế trước khi làm từng nhân vật.

--- PROMPT ---
A character lineup sheet in this style: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).

Six fighters stand side by side in one row, evenly spaced, all the same height scale, each in a fighting-guard stance facing right and holding their weapon, feet on one shared ground line. Under each fighter a small label with their name. Wide image, nothing overlapping.

1) "Thunder Monk" — a man: a tall old monk with a white beard, a dark blue robe and large golden beads. Weapon: an iron staff crackling with lightning.
2) "Phoenix Archer" — a woman: a proud woman in a red and gold feathered cloak, with feather ornaments in her hair. Weapon: a red-and-gold bow.
3) "Jade General" — a man: a clean-shaven general in jade-green scale armour with gold trim and a white cape (no long beard). Weapon: a halberd with a jade-green blade.
4) "Wind Sage" — a woman: a serene woman with long silver hair and flowing pale cyan robes. Weapon: a large white feather fan.
5) "Dragon Dancer" — a man: a young man in a red and gold festival outfit with flowing ribbons. Weapon: a staff topped with a carved dragon head.
6) "Tower Master" — a man: a calm older man with a grey topknot, a black and gold robe and soft black shoes. Weapon: a pair of hook swords.
```

## 2. Từng nhân vật

### `beggar`

```
BEGGAR (Kẻ ăn mày) · Thường · tuyệt chiêu "Cú đấm liều mạng" (Đòn chí mạng)

Tải lên 2 ảnh: (1) phần Beggar cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/beggar).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Beggar", a man: a lean young man with messy dark hair, a torn and patched brown shirt, a rope belt, ragged dark shorts, barefoot. Weapon: bare fists wrapped in dirty cloth strips, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Desperate Fist": 1) crouches low and pulls one fist far back, dust swirling at his feet. 2) the fist glows a faint orange. 3) lunges forward with a huge straight punch. 4) an orange shockwave ring bursts from the fist. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `street_kid`

```
STREET KID (Nhóc đường phố) · Thường · tuyệt chiêu "Ngắm chuẩn" (Tập trung)

Tải lên 2 ảnh: (1) phần Street Kid cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/street_kid).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Street Kid", a woman: a teenage girl with a short messy bob, an oversized faded blue jacket, rolled-up brown trousers and sandals. Weapon: a wooden slingshot and a pouch of pebbles, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Steady Aim": 1) kneels and pulls the slingshot band far back. 2) closes one eye, a small blue target ring appears in front of her. 3) releases: the pebble streaks forward with a blue trail. 4) stands up, a blue sparkle around her head. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `fisherman`

```
FISHERMAN (Ngư phủ) · Thường · tuyệt chiêu "Mái chèo quật sóng" (Choáng)

Tải lên 2 ảnh: (1) phần Fisherman cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/fisherman).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Fisherman", a man: a stocky middle-aged man with a short beard, an indigo work shirt, rolled-up trousers and a fishing net over one shoulder. Weapon: a long wooden oar, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Wave Slam": 1) raises the oar overhead with both hands. 2) water swirls around the oar blade. 3) slams the oar down: a splash wave rolls forward. 4) small yellow dizzy stars spark where the wave lands. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `farmer`

```
FARMER (Nông dân) · Thường · tuyệt chiêu "Gặt lúa" (Liên hoàn)

Tải lên 2 ảnh: (1) phần Farmer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/farmer).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Farmer", a woman: a sturdy young woman with a patterned headscarf, a brown work blouse, green trousers rolled to the knee and bare feet. Weapon: a curved sickle, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Harvest Sweep": 1) spins the sickle in a low arc. 2) first slash left to right with a green arc trail. 3) second rising slash with another green arc. 4) cut rice stalks scatter in the air around her. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `porter`

```
PORTER (Phu khuân vác) · Thường · tuyệt chiêu "Gánh sức" (Hút máu)

Tải lên 2 ảnh: (1) phần Porter cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/porter).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Porter", a man: a broad-shouldered man with a sleeveless grey vest, a towel around his neck, brown trousers and straw sandals. Weapon: a bamboo carrying pole, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Burden Shift": 1) spins the pole behind his back. 2) jabs the end of the pole forward. 3) red energy flows back along the pole into him. 4) flexes, small red sparks rising around him. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `herb_girl`

```
HERB GATHERER (Cô hái thuốc) · Thường · tuyệt chiêu "Thuốc tiên" (Hồi máu)

Tải lên 2 ảnh: (1) phần Herb Gatherer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/herb_girl).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Herb Gatherer", a woman: a slim girl with a long braid, a light green tunic, wide cream trousers and a small woven basket on her back. Weapon: a bottle gourd and a bundle of herbs, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Healing Brew": 1) uncorks the gourd. 2) drinks from it while green leaves swirl around her. 3) a soft green glow spreads over her body. 4) flings the gourd forward: a green splash. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `stick_fighter`

```
STICK FIGHTER (Võ sĩ gậy) · Hiếm · tuyệt chiêu "Gậy liên hoàn" (Liên hoàn)

Tải lên 2 ảnh: (1) phần Stick Fighter cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/stick_fighter).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Stick Fighter", a man: a wiry man with short hair, a sleeveless black tunic, a red waist sash and wrapped shins. Weapon: a long wooden bo staff, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Staff Flurry": 1) twirls the staff into a blurred circle. 2) thrusts it straight forward with a white impact flash. 3) sweeps it low with a second flash. 4) brings it down overhead with a third, bigger flash. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `temple_monk`

```
TEMPLE MONK (Nhà sư) · Hiếm · tuyệt chiêu "Tâm an" (Hồi máu)

Tải lên 2 ảnh: (1) phần Temple Monk cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/temple_monk).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Temple Monk", a man: a calm shaved-head monk in an ochre robe draped over one shoulder, cloth leg wraps and sandals. Weapon: wooden prayer beads and open palms, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Calm Mind": 1) presses his palms together, beads hanging from his hands. 2) a golden lotus circle appears under his feet. 3) golden light rises around his body. 4) pushes one palm forward: a golden wave. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `fan_dancer`

```
IRON FAN DANCER (Vũ nữ quạt sắt) · Hiếm · tuyệt chiêu "Vũ điệu hoa" (Choáng)

Tải lên 2 ảnh: (1) phần Iron Fan Dancer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/fan_dancer).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Iron Fan Dancer", a woman: an elegant woman with a hair bun held by a pin, a purple dress with side slits over black leggings and a pink sash. Weapon: a pair of folding steel war fans, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Petal Dance": 1) spins with both fans open. 2) pink petals swirl around her. 3) flings both fans forward: a storm of petals. 4) yellow dizzy stars sparkle among the petals ahead of her. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `forest_archer`

```
FOREST ARCHER (Cung thủ rừng) · Hiếm · tuyệt chiêu "Mắt diều hâu" (Tập trung)

Tải lên 2 ảnh: (1) phần Forest Archer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/forest_archer).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Forest Archer", a woman: a lean woman in a hooded green cloak, a leather bracer, brown leggings and soft boots. Weapon: a wooden longbow and a quiver of arrows, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Hawk Eye": 1) draws the bow fully. 2) blue focus rings gather around the arrow tip. 3) releases a glowing blue arrow. 4) lowers the bow, a blue sparkle around her head. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `blacksmith`

```
BLACKSMITH (Thợ rèn) · Hiếm · tuyệt chiêu "Búa nung đỏ" (Đòn chí mạng)

Tải lên 2 ảnh: (1) phần Blacksmith cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/blacksmith).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Blacksmith", a man: a broad man with a soot-smudged face, a headband, a leather apron over bare arms and thick gloves. Weapon: a heavy forge hammer, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Red-Hot Hammer": 1) hefts the hammer back, its head glowing red. 2) sparks fly from the hammer. 3) smashes it down. 4) a burst of embers and a big orange flash. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `rope_dart`

```
ROPE DART WANDERER (Hiệp khách phi tiêu) · Hiếm · tuyệt chiêu "Móc dây" (Hút máu)

Tải lên 2 ảnh: (1) phần Rope Dart Wanderer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/rope_dart).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Rope Dart Wanderer", a man: a slim young man in dark teal travelling clothes, a scarf around his neck and wrapped forearms. Weapon: a rope dart: a small blade on a long red rope, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Hook and Pull": 1) swings the dart in a circle overhead. 2) throws it forward on the rope. 3) yanks it back while red energy runs along the rope to him. 4) catches the dart, small red sparks rising around him. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `swordswoman`

```
SWORDSWOMAN (Nữ kiếm khách) · Sử thi · tuyệt chiêu "Kiếm vũ ba thức" (Liên hoàn)

Tải lên 2 ảnh: (1) phần Swordswoman cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/swordswoman).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Swordswoman", a woman: a poised woman with a long high ponytail, sky-blue and white layered robes and a dark belt. Weapon: a straight double-edged sword with a blue tassel, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Three-Form Sword": 1) draws and slashes in one motion with a blue arc. 2) spins and slashes again with a second blue arc. 3) thrusts forward with a long blue streak. 4) holds the finishing pose while the arcs fade. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `spear_guard`

```
SPEAR GUARD (Vệ binh giáo) · Sử thi · tuyệt chiêu "Thương xuyên giáp" (Choáng)

Tải lên 2 ảnh: (1) phần Spear Guard cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/spear_guard).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Spear Guard", a man: a tall soldier in bronze lamellar armour, a red under-robe and a round helmet. Weapon: a long spear with a red tassel, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Piercing Lunge": 1) crouches with the spear drawn back. 2) a golden glint runs along the spearhead. 3) a long lunging thrust. 4) a shockwave ring with yellow stars at the spear tip. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `twin_sabre`

```
TWIN SABRE (Song đao nữ) · Sử thi · tuyệt chiêu "Song đao huyết" (Hút máu)

Tải lên 2 ảnh: (1) phần Twin Sabre cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/twin_sabre).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Twin Sabre", a woman: a fierce woman with short spiky hair, a crimson vest, black trousers and wrapped forearms. Weapon: two curved sabres, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Crimson Cross": 1) crosses both sabres in front of her. 2) dashes forward. 3) an X-shaped red slash. 4) red mist flows back into her. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `chain_whip`

```
CHAIN WHIP (Roi xích) · Sử thi · tuyệt chiêu "Xích long" (Đòn chí mạng)

Tải lên 2 ảnh: (1) phần Chain Whip cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/chain_whip).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Chain Whip", a man: a muscular man with shaved sides and a short topknot, a grey-blue tunic and metal bracers. Weapon: a nine-section steel chain whip, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Chain Dragon": 1) spins the chain around his body. 2) the chain glows silver. 3) cracks it forward in a long straight line. 4) a big white crack flash at its end. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `war_drummer`

```
WAR DRUMMER (Chiến binh trống) · Sử thi · tuyệt chiêu "Trống trận" (Hồi máu)

Tải lên 2 ảnh: (1) phần War Drummer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/war_drummer).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "War Drummer", a man: a big bearded man in a red-brown vest, gold armbands and wide dark trousers. Weapon: two drum mallets, with a small war drum on his back, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Battle Drum": 1) swings the drum around to his front. 2) beats it: rings of sound. 3) orange and green rings pulse outward. 4) roars, green sparks rising around him. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `shadow_runner`

```
SHADOW RUNNER (Kẻ chạy bóng) · Sử thi · tuyệt chiêu "Ẩn bóng" (Tập trung)

Tải lên 2 ảnh: (1) phần Shadow Runner cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/shadow_runner).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Shadow Runner", a woman: a slim woman in a dark charcoal hooded wrap, a cloth over her mouth and a long purple scarf. Weapon: two short knives and a smoke pouch, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Vanish": 1) throws the smoke pouch at her feet. 2) purple smoke hides her. 3) reappears mid-air slashing with both knives. 4) lands, a purple afterimage behind her. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `thunder_monk`

```
THUNDER MONK (Sư sấm) · Huyền thoại · tuyệt chiêu "Lôi thần trượng" (Đòn chí mạng)

Tải lên 2 ảnh: (1) phần Thunder Monk cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/thunder_monk).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Thunder Monk", a man: a tall old monk with a white beard, a dark blue robe and large golden beads. Weapon: an iron staff crackling with lightning, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Thunder Staff": 1) raises the staff to the sky. 2) lightning strikes the staff. 3) slams the staff down. 4) a lightning bolt runs forward along the ground. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `phoenix_archer`

```
PHOENIX ARCHER (Cung thủ phượng) · Huyền thoại · tuyệt chiêu "Tên phượng hoàng" (Hút máu)

Tải lên 2 ảnh: (1) phần Phoenix Archer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/phoenix_archer).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Phoenix Archer", a woman: a proud woman in a red and gold feathered cloak, with feather ornaments in her hair. Weapon: a red-and-gold bow, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Phoenix Arrow": 1) draws the bow while wings of fire spread behind her. 2) the arrow becomes a small fire bird. 3) releases: the fire bird flies forward. 4) embers drift back into her. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `jade_general`

```
JADE GENERAL (Tướng ngọc) · Huyền thoại · tuyệt chiêu "Ngọc trấn sơn" (Choáng)

Tải lên 2 ảnh: (1) phần Jade General cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/jade_general).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Jade General", a man: a clean-shaven general in jade-green scale armour with gold trim and a white cape (no long beard). Weapon: a halberd with a jade-green blade, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Jade Mountain": 1) plants the halberd in the ground. 2) jade crystals rise from the ground around him. 3) a wide sweeping strike. 4) the crystals shatter forward with yellow stars. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `wind_sage`

```
WIND SAGE (Hiền giả gió) · Huyền thoại · tuyệt chiêu "Gió lặng" (Tập trung)

Tải lên 2 ảnh: (1) phần Wind Sage cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/wind_sage).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Wind Sage", a woman: a serene woman with long silver hair and flowing pale cyan robes. Weapon: a large white feather fan, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Still Wind": 1) opens the fan. 2) wind spirals around her. 3) waves the fan: a gust full of leaves. 4) floats a little above the ground, cyan sparkles around her. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `dragon_dancer`

```
DRAGON DANCER (Vũ sư rồng) · Huyền thoại · tuyệt chiêu "Rồng múa" (Liên hoàn)

Tải lên 2 ảnh: (1) phần Dragon Dancer cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/dragon_dancer).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Dragon Dancer", a man: a young man in a red and gold festival outfit with flowing ribbons. Weapon: a staff topped with a carved dragon head, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Dragon Dance": 1) spins the staff, ribbons trailing. 2) a golden dragon outline coils around him. 3) a first strike forward. 4) a second strike: the golden dragon bursts forward. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```

### `tower_master`

```
TOWER MASTER (Chủ tháp) · Huyền thoại · tuyệt chiêu "Tâm pháp" (Hồi máu)

Tải lên 2 ảnh: (1) phần Tower Master cắt từ ảnh lineup đã chốt, (2) character-template.png.
Gửi ảnh kết quả cho Claude; Claude cắt thành 26 frame và đưa vào app (characters/tower_master).

--- PROMPT ---
Draw the character from the first image in EVERY labelled cell of the second image (the template), as an animation sheet. Keep the template exactly as it is: the same canvas size, the same cells and the same purple labels. Draw nothing outside the cells and do not add any other text.

CHARACTER, identical in every cell: "Tower Master", a man: a calm older man with a grey topknot, a black and gold robe and soft black shoes. Weapon: a pair of hook swords, always in hand (except when knocked out).
STYLE: 16-bit pixel-art fighting-game sprite, as if drawn on a 64x64 pixel grid and enlarged with hard square pixels; no anti-aliasing, no blur, no gradients; a limited palette of about 24 colours; a 1-pixel dark outline; 3/4 side view FACING RIGHT; full body; plain pure-white background. An ORIGINAL character: not resembling Street Fighter, Tekken, Mortal Kombat or any existing game, anime or film character (no white karate gi with a red headband).
PLACEMENT: in every cell the character is the same size: standing, the head reaches the dotted line and the feet are on the dashed ground line, centred on the small vertical mark. Attacks, effects and the weapon stay inside the cell. Nothing crosses into another cell.

ROWS (each labelled cell is one frame, left to right):
- idle-1..4: fighting-guard stance with the weapon ready, breathing gently (tiny up and down), so the 4 frames loop.
- light-1..4: a quick attack with the weapon: wind-up, strike, follow-through, back to guard.
- heavy-1..4: a big, powerful attack with the weapon: a bigger wind-up, a wide strike, follow-through, recover.
- hit-1..2: hit by an opponent: flinches backward, then staggers.
- ko-1..4: knocked out: reels, falls backward, hits the ground, lies flat on the ground line with the weapon beside them.
- win-1..4: victory: raises the weapon in triumph, a small hop, a proud pose; the 4 frames loop.
- skill-1..4: the signature skill "Master's Breath": 1) crosses the hook swords. 2) takes a deep breath, a gold aura around him. 3) spins the hooks, gold rings around him. 4) gold sparks rise around him. Glows, sparks and effects stay inside the cell.

Plain pure-white background in every cell. No shadows on the ground.
```
