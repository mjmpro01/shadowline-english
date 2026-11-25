# Prompt tạo hình Đấu trường bằng AI (pixel art)

Bộ prompt để tạo hình võ sĩ cho Đấu trường bằng công cụ tạo ảnh như ChatGPT
hay Gemini. Phong cách là **pixel art 16-bit**, theo các ảnh tham khảo đã
chọn. Định dạng file xem [`arena-sprites.md`](arena-sprites.md).

Prompt viết bằng tiếng Anh vì các công cụ hiểu tiếng Anh tốt hơn. Phần giải
thích bằng tiếng Việt. Có bản tách sẵn mỗi hình một file `.txt` (zip
`arena-prompts-v2`), sinh từ đúng nội dung này.

## 0. Cách làm

AI không vẽ được sprite sheet nhiều khung thẳng hàng. Vì vậy dùng **chế độ một
tư thế**:
- Mỗi lớp chỉ là **một ảnh 64 × 64** pixel art ở tư thế đứng thủ.
- App phóng to sắc nét, không làm mờ.
- App tự làm các động tác (lao tới, trúng đòn, ngã KO, ăn mừng) bằng cách di
  chuyển cả chồng lớp.

Quy trình:

1. **Mở đầu cuộc trò chuyện** bằng tin nhắn ở mục 1, để ChatGPT giữ phong cách.
2. **Tạo thân `a-0` (nam)** và chọn ảnh đẹp nhất làm **ảnh gốc**. Sau đó tạo
   thân `b-0` (nữ) làm ảnh gốc thứ hai.
3. **Tóc và đồ**:
   - Tải ảnh gốc lên rồi yêu cầu **chỉ vẽ món đó** trên nền trong suốt, cùng
     cỡ, cùng vị trí (prompt ở mục 4 và 5).
   - Nếu ChatGPT vẫn vẽ cả người, dùng prompt sửa "keep everything, only add…".
     Sau đó gửi cả ảnh gốc lẫn ảnh đã sửa để cắt lấy phần mới.
4. **Đưa vào app**: dễ nhất là gửi ảnh cho Claude kèm tên file cần ra. Claude
   cắt nền, thu về 64 × 64, căn chân và đặt đúng chỗ. Tự làm cũng được:
   - thu nhỏ về **64 × 64** bằng "Nearest Neighbor" (Photopea: Image › Image
     Size);
   - nền trong suốt, quay mặt sang **phải**;
   - chân ở **y = 60**, giữa người ở **x = 32**;
   - mọi lớp đúng vị trí như ảnh gốc;
   - lưu vào `app/public/arena/{base,hair,gear,opponents}/`, rồi chạy
     `cd app && npm run arena:manifest`.

Giao dần được: một võ sĩ hiện bằng hình thật ngay khi **mọi lớp** của họ đã
có. Bộ đầu tiên nên làm, đủ cho võ sĩ nam mới tạo:
- `base/a-0`;
- `hair/a-0`;
- `gear/rags`;
- `gear/bare_fists`, `gear/bare_feet` (hai file này chỉ là PNG trong suốt).

**Không** dùng nhân vật giống game khác. Ví dụ: võ phục trắng với băng đầu đỏ
và găng đỏ giống một nhân vật Street Fighter nổi tiếng. Nếu ChatGPT vẽ như
vậy, bỏ ảnh đó và tạo lại.

## 1. Tin nhắn mở đầu và khối phong cách

Tin nhắn mở đầu, dán vào ChatGPT trước tiên:

```text
I'm making paper-doll sprite layers for my own original 2D fighting game, in
16-bit pixel art. Every image in this chat must follow this style exactly, and
every layer must line up with the same base sprite: same pose, same size,
same position, same pixel scale. When I upload a sprite and ask for one item,
draw ONLY that item on a transparent canvas of the same size, in the same
place. Style: [KHỐI PHONG CÁCH]
```

Khối phong cách (dán vào đầu prompt tạo thân và tạo đối thủ):

```text
16-bit pixel-art sprite for an original side-view fighting game. The
character is drawn on a 64x64 pixel grid and shown enlarged with hard square
pixels: no anti-aliasing, no blur, no gradients, a limited palette of about
24 colours, a 1-pixel dark outline, simple 2-3 tone shading. 3/4 side view
facing RIGHT, full body, fighting-guard stance: feet apart, knees slightly
bent, both fists raised. The figure fills most of the height, feet at the
bottom. Square image, transparent background, no ground, no shadow, no text,
no logo. An original design that does not resemble any existing game
character: no white karate gi with a red headband, no famous fighting-game
outfits.
```

## 2. Màu chuẩn

| Màu da | Mã | | Kiểu tóc | Mã màu |
| --- | --- | --- | --- | --- |
| 0 | `#f3d2b3` light | | 1 | `#2b1d14` gần đen |
| 1 | `#dcae86` tan | | 2 | `#6b3f1d` nâu hạt dẻ |
| 2 | `#b07a50` brown | | 3 | `#c99a3b` vàng |
| 3 | `#7a4e2e` deep brown | | 4 | `#9a9aa3` bạc |

## 3. Thân: `base/{a|b}-{0..3}.png` (8 file)

- Dáng `a` là **nam**, dáng `b` là **nữ**.
- Thân là lớp dưới cùng, **trọc đầu** vì tóc là lớp riêng.

```text
[KHỐI PHONG CÁCH]
The character: {WHO}. Skin colour {SKIN_HEX} ({SKIN_WORD} skin). A smooth,
completely bald head (hair is a separate layer). Simple friendly face.
No accessories.
```

Thay `{WHO}` như sau:

- nam: `a young adult MALE fighter, athletic, bare-chested, wearing only plain dark grey shorts, bare feet`
- nữ: `a young adult FEMALE fighter, athletic, wearing only a plain dark grey sports top and shorts, bare feet`

Các màu da khác nên **sửa từ ảnh gốc**, để giữ đúng tư thế:

```text
Edit this sprite. Keep the pose, framing, size and position exactly the same.
Change the skin colour to {SKIN_HEX}. Smooth bald head. Nothing else changes.
```

## 4. Tóc: `hair/{a|b}-{0..3}.png` (8 file)

Tải ảnh thân `a-0` (tóc nam) hoặc `b-0` (tóc nữ) lên rồi gửi:

```text
Use the uploaded sprite as the reference. Make a new image of exactly the
same size in which ONLY the hair: {HAIR}, colour {HAIR_HEX} is drawn,
exactly where it sits on this character in this pose, at the same pixel
scale. Everything else (body, skin, face, background) must be fully
transparent. Same 16-bit pixel-art style and palette, 1-pixel dark outline,
hard square pixels.
```

Kiểu 1–4 ứng với file `-0` đến `-3`, cũng là "Kiểu 1–4" trong bộ tạo nhân vật.

| Kiểu | Nam (`a`) | Nữ (`b`) |
| --- | --- | --- |
| 1 | `a short, neat crop` | `a short bob to the jaw` |
| 2 | `short spiky hair pointing up and back` | `a spiky pixie cut` |
| 3 | `long hair swept to one side, reaching the shoulder` | `long hair swept to one side, past the shoulder` |
| 4 | `shaved sides with a small topknot bun` | `a high ponytail` |

## 5. Trang bị: `gear/{mã}.png` (20 file)

Tải ảnh thân `a-0` lên rồi dùng đúng prompt "ONLY … is drawn" ở mục 4, thay
phần tóc bằng mô tả món đồ dưới đây.

| Mã | Ô | Mô tả |
| --- | --- | --- |
| `rags` | áo | `ragged beggar clothes: a torn, faded brown sack-cloth shirt with a frayed hem, patches and a rope belt` |
| `patched_tunic` | áo | `a simple olive-green tunic with a few square patches and a cloth sash` |
| `leather_vest` | áo | `a brown leather vest with stitched seams, small shoulder pads and a wide belt` |
| `scale_mail` | áo | `a shirt of steel-blue metal scales with a leather collar and bright highlights` |
| `bare_fists` | tay | PNG 64 × 64 trong suốt hoàn toàn, không cần ChatGPT |
| `cloth_wraps` | tay | `off-white cloth hand wraps around both fists and wrists` |
| `leather_gloves` | tay | `brown fingerless leather fighting gloves with wrist straps` |
| `iron_knuckles` | tay | `heavy dark iron knuckle guards over both fists, with bright edges` |
| `bare_feet` | chân | PNG 64 × 64 trong suốt hoàn toàn |
| `straw_sandals` | chân | `woven straw sandals with cord ties around the ankles` |
| `swift_boots` | chân | `light blue cloth-and-leather boots with wrapped shins` |
| `straw_hat` | đầu | `a wide conical woven straw hat, tilted slightly` |
| `leather_cap` | đầu | `a fitted brown leather skull cap with ear flaps` |
| `iron_helm` | đầu | `a rounded iron helmet with a nose guard and a short steel-blue crest` |
| `walking_stick` | vũ khí | `a gnarled wooden walking stick held in the front fist` |
| `bo_staff` | vũ khí | `a long wooden bo staff with dark grip bands, held diagonally in both fists` |
| `twin_blades` | vũ khí | `two short curved swords, one in each fist, with a faint golden glow` |
| `lucky_coin` | bùa | `a small gold coin with a square hole on a red cord around the neck` |
| `jade_charm` | bùa | `a small carved green jade pendant on a dark cord around the neck` |
| `phoenix_feather` | bùa | `a small glowing orange-red feather pinned on the chest, with 2-3 ember pixels` |

Một món dùng chung cho cả nam và nữ, nên vẽ theo thân nam, hơi rộng một chút.

## 6. Đối thủ vẽ riêng (tuỳ chọn): `opponents/{mã}.png`

Đối thủ của tháp **tự có hình** khi thân, tóc và đồ của họ đã có. Muốn trùm nổi
bật hơn thì vẽ nguyên nhân vật, cũng 64 × 64 và quay mặt sang phải:

```text
[KHỐI PHONG CÁCH]
The character: {DESCRIPTION}. Skin colour {SKIN_HEX}, hair colour {HAIR_HEX}.
A tougher, more distinctive look than an ordinary fighter, same size and framing.
```

Mô tả của từng đối thủ, theo giới tính của dáng họ, nằm trong thư mục
`05-opponents-tuy-chon` của zip. Đối thủ tầng 13, "Bóng gương", không cần vẽ vì
luôn giống người chơi.

## 7. Kiểm tra trước khi nộp

- [ ] Đúng **64 × 64**, pixel vuông sắc, không mờ.
- [ ] Nền trong suốt.
- [ ] Quay mặt sang phải.
- [ ] Chân ở y = 60 và người giữa x = 32: chồng thử lớp mới lên thân xem có lệch
      không.
- [ ] Đúng tên file: chữ thường, đúng mã.
- [ ] Không giống nhân vật game khác.
- [ ] Chạy `npm run arena:manifest` không báo lỗi. Script báo "khung 64 px
      (pixel art)".

## 8. Hoạt hình đồng bộ theo frame (v3)

Phần 1–7 làm ra **một tư thế** cho mỗi lớp. Bước tiếp theo là cho võ sĩ động
thật: mỗi lớp có **22 frame** chia thành 6 động tác (xem
[`arena-sprites.md`](arena-sprites.md) mục 2). Mọi lớp phải theo **cùng tư thế
ở cùng frame**, nên thứ tự làm như sau.

### Bước 1: 22 frame của thân, làm trước

Thân là template cho mọi lớp còn lại. Làm cho `base/a-0` (nam) và `base/b-0`
(nữ). Các màu da khác đổi màu từ hai bộ này.

Tải ảnh thân một tư thế (`base/a-0.png` hoặc `base/b-0.png`) lên làm mẫu, rồi
gửi lần lượt từng frame:

```text
Use the uploaded sprite as the exact reference: same character, same canvas
size, same pixel scale, same proportions, same colours, 3/4 view facing right.
Keep the feet on the same ground line as the reference unless the pose says
otherwise. Draw this one frame: {POSE}. Bald head, no clothes beyond the
reference's, no hair, transparent background, hard square pixels.
```

| Frame | `{POSE}` |
| --- | --- |
| `idle-1` | `relaxed guard stance, exactly as the reference` |
| `idle-2` | `the same guard, chest risen 1 pixel as if breathing in` |
| `idle-3` | `the same guard, exactly as idle-1` |
| `idle-4` | `the same guard, knees bent 1 pixel lower, breathing out` |
| `light-1` | `wind-up: front fist pulled back to the chin, weight on the back foot` |
| `light-2` | `quick jab half extended forward at shoulder height` |
| `light-3` | `jab fully extended, front arm straight, shoulder turned in` |
| `light-4` | `recovering, front fist coming back towards the guard` |
| `heavy-1` | `chamber: front knee lifted to the waist, arms in guard` |
| `heavy-2` | `pivoting on the back foot, hips turning, kick starting` |
| `heavy-3` | `front kick fully extended forward at waist height` |
| `heavy-4` | `landing the kicking foot back, returning to guard` |
| `hit-1` | `struck: head snapped back, torso leaning back, guard broken` |
| `hit-2` | `staggering half a step back, arms low, wincing` |
| `ko-1` | `knees buckling, arms dropping, leaning backwards` |
| `ko-2` | `falling backwards, one foot off the ground` |
| `ko-3` | `hitting the ground on the back, arms flung out` |
| `ko-4` | `lying flat on the back on the ground line, eyes closed` |
| `win-1` | `standing tall, one fist pumping down at the waist` |
| `win-2` | `that fist raised high overhead, grinning` |
| `win-3` | `small victory hop, both feet 4 pixels off the ground, fist up` |
| `win-4` | `landed, fist still raised, other hand on the hip` |

Lưu từng frame thành `app/art/arena-frames/base/a-0/{frame}.png`, ví dụ
`idle-1.png`. Hoặc gửi cả loạt cho Claude cắt, căn chân và ghép.

### Bước 2: tóc và đồ, đè lên từng frame của thân

Với mỗi món (và mỗi kiểu tóc), lặp lại 22 lần. Tải **frame cùng tên của thân**
lên, ví dụ `base/a-0/light-3.png`, rồi gửi:

```text
Use the uploaded sprite as the reference. Make a new image of exactly the
same size in which ONLY {ITEM} is drawn, exactly where it sits on this
character in this exact pose, at the same pixel scale. Everything else (body,
skin, face, background) must be fully transparent. Same 16-bit pixel-art
style and palette, 1-pixel dark outline, hard square pixels.
```

`{ITEM}` lấy từ bảng ở mục 4 (tóc) và mục 5 (đồ). Lưu thành
`app/art/arena-frames/{lớp}/{frame}.png`, ví dụ `gear/rags/light-3.png`.

Mỗi dáng một bản: món nào vẽ theo thân nam thì lưu vào `gear/{mã}@a/`, theo
thân nữ thì vào `gear/{mã}@b/`. Một bản chung (`gear/{mã}/`) chỉ dùng được khi
nó vừa cả hai thân ở mọi frame.

### Bước 3: phần nằm sau thân

Tóc dài, áo choàng và vũ khí ở tay phía xa phải tách làm hai: phần trước vẽ như
bước 2, phần sau vẽ bằng prompt dưới và lưu vào lớp `.back`, ví dụ
`hair/b-2.back/`:

```text
Same as before, but draw ONLY the part of {ITEM} that is hidden BEHIND the
body (behind the head, shoulders or torso) in this pose. Nothing in front of
the body.
```

### Bước 4: ghép và kiểm tra

```sh
cd app && npm run arena:sheet && npm run arena:manifest
```

Script báo từng frame sai, ví dụ chân thân lệch vạch đất hoặc hình ở ô thừa. Nó
cũng báo những lớp còn là một tư thế đang giữ một thân đã động.

**Khối lượng:** mỗi lớp 22 frame. Thứ tự nên làm:
1. 2 thân;
2. bộ ăn mày (`rags`), vì mọi võ sĩ mới đều mặc;
3. 2 kiểu tóc đầu tiên;
4. phần còn lại.

Tới khi một võ sĩ có đủ sheet cho mọi lớp, họ vẫn hiện bằng hình một tư thế như
hiện nay.
