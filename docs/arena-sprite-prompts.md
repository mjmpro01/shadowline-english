# Prompt tạo hình Đấu trường bằng AI

Bộ prompt để tạo hình võ sĩ cho Đấu trường bằng công cụ tạo ảnh (ChatGPT,
Gemini, Midjourney, Stable Diffusion…). Định dạng file xem
[`arena-sprites.md`](arena-sprites.md).

Prompt viết bằng tiếng Anh vì các công cụ hiểu tiếng Anh tốt hơn. Phần giải
thích bằng tiếng Việt.

## 0. Cách làm (đọc trước)

AI tạo ảnh **không vẽ được** sprite sheet nhiều khung thẳng hàng, càng không vẽ
được từng món đồ khớp với thân người qua 9 động tác. Vì vậy dùng **chế độ một
tư thế**: mỗi lớp chỉ là **một ảnh 256 × 256** ở tư thế đứng thủ. App tự làm
các động tác (lao tới đánh, trúng đòn, ngã KO, ăn mừng) bằng cách di chuyển cả
chồng lớp, như với hình tạm hiện nay.

Quy trình:

1. **Tạo thân trước** (mục 3). Chọn một ảnh ưng ý nhất làm **ảnh gốc**. Mọi ảnh
   sau đều dựa trên nó để khớp vị trí.
2. **Tóc và trang bị là ảnh _sửa_ từ ảnh gốc**, không tạo mới từ đầu: dán ảnh
   gốc vào rồi dùng prompt ở mục 4 và 5.
   - ChatGPT / Gemini: tải ảnh lên, gửi prompt "edit".
   - Midjourney: `--cref <ảnh gốc> --cw 100`, hoặc Vary (Region).
   - Stable Diffusion: inpainting vùng cần thêm.
3. **Tách lớp**: từ ảnh đã sửa, xoá hết, chỉ giữ món mới (tóc, áo, mũ…).
   - Dùng Photoshop, Photopea (miễn phí) hoặc GIMP: chồng ảnh sửa lên ảnh gốc,
     tẩy phần trùng.
   - Thân trần thì xoá nền bằng remove.bg hoặc công cụ tách nền.
4. **Chuẩn hoá** từng file:
   - **256 × 256 px**, PNG nền trong suốt;
   - quay mặt sang **phải**;
   - lòng bàn chân ở **y = 240**, giữa người ở **x = 128**;
   - cùng một tỉ lệ cho mọi file. Tạo ảnh ở 1024 × 1024 rồi thu nhỏ đúng 4 lần
     là dễ nhất.
5. **Đặt file** vào `app/public/arena/{base,hair,gear,opponents}/`, đúng tên ở
   các mục dưới.
6. **Chạy** `cd app && npm run arena:manifest`. Script kiểm tra kích thước và
   độ trong suốt, ghi `manifest.json` và liệt kê lớp còn thiếu.

Giao dần được: một võ sĩ hiện bằng hình thật ngay khi **mọi lớp** của họ đã có.
Gợi ý thứ tự:

1. `base/a-0`;
2. `hair/a-0`;
3. bộ ăn mày `rags`, `bare_fists`, `bare_feet` (2 món sau là PNG trong suốt);
4. sau đó các thân, tóc và đồ còn lại.

## 1. Khối phong cách chung

Dán đoạn này vào **đầu mọi prompt** để các ảnh cùng một phong cách:

```text
2D game character art for an original fighting game. Chunky, readable
silhouette, stylised proportions (head about 1/6 of height), clean dark
outlines, flat cel shading with one soft shadow tone, warm earthy palette.
Full body, side view, facing right, in a relaxed martial-arts guard stance:
feet apart, knees slightly bent, front fist raised at chest height, back fist
near the chin. The whole figure fits in the frame with a small margin, feet on
the bottom margin. Plain transparent background (or flat pure white if
transparency is not possible), no ground, no shadow, no text, no watermark,
no logo. An original design that does not resemble any existing game or
anime character.
```

## 2. Màu chuẩn

Dùng đúng các mã màu này để hình thật giống hình tạm và bộ tạo nhân vật.

| Màu da | Mã | Mô tả |
| --- | --- | --- |
| 0 | `#f3d2b3` | light skin |
| 1 | `#dcae86` | tan skin |
| 2 | `#b07a50` | brown skin |
| 3 | `#7a4e2e` | deep brown skin |

| Kiểu tóc | Mã màu | Mô tả |
| --- | --- | --- |
| 0 | `#2b1d14` | short neat crop, near-black |
| 1 | `#6b3f1d` | spiky messy hair, chestnut brown |
| 2 | `#c99a3b` | long side-swept hair to the shoulder, golden blond |
| 3 | `#9a9aa3` | shaved sides with a topknot bun, silver grey |

## 3. Thân người: `base/{a|b}-{0..3}.png` (8 file)

Thân là lớp dưới cùng: người trần, **trọc đầu** (để tóc chồng lên), mặc quần
đùi trơn, chân đất.

```text
[KHỐI PHONG CÁCH CHUNG]
A young adult fighter's bare base body, used as a paper-doll layer:
{BUILD}. Skin colour {SKIN_HEX} ({SKIN_WORD}). Completely bald, smooth scalp
(hair is a separate layer). Neutral friendly face with simple eyes and
eyebrows. Wearing only plain dark grey knee-length shorts. Bare hands
(loose fists), bare feet. No clothes on the torso, no accessories, no tattoos.
```

Thay `{BUILD}`:

- dáng `a`: `lean, agile build with narrow shoulders and long limbs`
- dáng `b`: `broad, stocky build with wide shoulders and thick arms`

Thay `{SKIN_HEX}` và `{SKIN_WORD}` theo bảng màu da: `a-0`, `a-1`… `b-3`.

Mẹo: tạo `a-0` cho đẹp trước. Các màu da khác là ảnh **sửa** từ `a-0`
("same image, only change the skin colour to `#b07a50`"), để dáng và tư thế
giữ nguyên. Dáng `b` cũng sửa từ `a-0` ("same pose and framing, make the body
broad and stocky").

## 4. Tóc: `hair/{a|b}-{0..3}.png` (8 file)

Mở ảnh thân `a-0` (hoặc `b-0` cho dáng b) rồi sửa:

```text
Edit this image. Keep the body, pose, framing and position exactly the same.
Only add hair: {HAIR}. Hair colour {HAIR_HEX}. Clean outline, same cel
shading as the body. Nothing else changes.
```

Thay `{HAIR}`:

| Kiểu | `{HAIR}` |
| --- | --- |
| 0 | `a short, neat crop close to the head` |
| 1 | `spiky, messy hair pointing up and back` |
| 2 | `long hair swept to one side, reaching the shoulder` |
| 3 | `shaved sides with a tight topknot bun on top` |

Rồi tách lớp: chỉ giữ phần tóc, còn lại trong suốt. Tóc dáng `b` làm riêng
trên thân `b-0`, vì đầu và vai rộng hơn.

## 5. Trang bị: `gear/{mã}.png` (20 file)

Mở ảnh thân `a-0` rồi sửa với prompt:

```text
Edit this image. Keep the body, pose, framing and position exactly the same.
Only add {ITEM}. It must fit the body exactly where it is worn. Clean
outline, same cel shading. Nothing else changes.
```

Rồi tách: chỉ giữ món đồ. Phần đồ che thân thì giữ, phần thân lộ ra thì xoá.

Một món dùng chung cho cả 2 dáng, nên vẽ hơi rộng để vừa dáng `b`. Muốn khớp
hoàn hảo thì cân nhắc chỉ dùng một dáng.

Độ hiếm quyết định độ nổi bật:

- **thường**: màu đất, đơn giản;
- **hiếm**: chi tiết hơn;
- **sử thi**: kim loại sáng;
- **huyền thoại**: có ánh phát sáng nhẹ.

| Mã | Ô | Độ hiếm | `{ITEM}` |
| --- | --- | --- | --- |
| `rags` | áo | thường | `ragged beggar's clothes: a torn, faded brown sack-cloth shirt with frayed hem and visible patches, tied with a rope belt` |
| `patched_tunic` | áo | thường | `a simple olive-green cotton tunic with a few neat square patches and a cloth sash` |
| `leather_vest` | áo | hiếm | `a sturdy brown leather vest with stitched seams, shoulder pads and a wide belt` |
| `scale_mail` | áo | sử thi | `a shirt of overlapping steel-blue metal scales with a leather collar, polished highlights` |
| `bare_fists` | tay | thường | Không cần vẽ: nộp PNG 256 × 256 trong suốt hoàn toàn. |
| `cloth_wraps` | tay | thường | `off-white cloth hand wraps around both fists and wrists` |
| `leather_gloves` | tay | hiếm | `brown fingerless leather fighting gloves with wrist straps` |
| `iron_knuckles` | tay | sử thi | `heavy iron knuckle guards over both fists, dark steel with bright edges` |
| `bare_feet` | chân | thường | Không cần vẽ: nộp PNG trong suốt. |
| `straw_sandals` | chân | thường | `woven straw sandals with cord ties around the ankles` |
| `swift_boots` | chân | hiếm | `light blue cloth-and-leather boots with wind-swirl stitching, wrapped shins` |
| `straw_hat` | đầu | thường | `a wide conical woven straw hat, tilted slightly, with a chin cord` |
| `leather_cap` | đầu | hiếm | `a fitted brown leather skull cap with ear flaps and stitched seams` |
| `iron_helm` | đầu | sử thi | `a rounded iron helmet with a nose guard and a short steel-blue crest` |
| `walking_stick` | vũ khí | thường | `a gnarled wooden walking stick held in the front hand, reaching from hip to above the head` |
| `bo_staff` | vũ khí | hiếm | `a long straight wooden bo staff with dark grip bands, held diagonally in both hands` |
| `twin_blades` | vũ khí | huyền thoại | `two short curved swords, one in each hand, bright steel with a faint golden glow along the edges` |
| `lucky_coin` | bùa | thường | `a small gold coin with a square hole, hanging on a red cord around the neck` |
| `jade_charm` | bùa | hiếm | `a carved green jade pendant on a dark cord around the neck` |
| `phoenix_feather` | bùa | huyền thoại | `a glowing orange-red phoenix feather pinned on the chest, with tiny embers around it` |

Lưu ý khi cầm vũ khí: tay trong ảnh gốc đang nắm. Vũ khí phải nằm đúng trong
nắm tay đó, đừng để AI vẽ lại bàn tay ở chỗ khác.

## 6. Đối thủ vẽ riêng (tuỳ chọn): `opponents/{mã}.png`

Đối thủ của tháp **tự có hình** khi thân, tóc và đồ của họ đã có (xem bảng
dưới), nên không bắt buộc vẽ riêng. Nếu muốn trùm (tầng 5, 10, 15) nổi bật hơn,
vẽ nguyên một nhân vật, cũng một tư thế, 256 × 256:

```text
[KHỐI PHONG CÁCH CHUNG]
{DESCRIPTION}. Make them look tougher and more distinctive than an ordinary
fighter, but keep the same size and framing.
```

Vì ảnh này lật để quay mặt sang trái, cũng vẽ **quay mặt sang phải**.

| Tầng | Mã | Tên | Dáng / da / tóc | Đồ | `{DESCRIPTION}` gợi ý |
| --- | --- | --- | --- | --- | --- |
| 1 | `pickpocket` | Kẻ móc túi | a / 2 / 1 | rags, cloth_wraps | `a sly, wiry street pickpocket in ragged clothes and cloth hand wraps, shifty grin` |
| 2 | `dockhand` | Phu bến cảng | b / 3 / 0 | patched_tunic, straw_hat | `a big, weathered dock worker in a patched tunic and straw hat, rope over the shoulder` |
| 3 | `market_bully` | Gã chợ búa | b / 1 / 3 | patched_tunic, leather_gloves | `a swaggering market bully with a topknot, leather gloves, smirking` |
| 4 | `stick_fighter` | Võ sĩ gậy | a / 0 / 2 | patched_tunic, walking_stick, straw_sandals | `a calm young stick fighter with long golden hair, walking stick and straw sandals` |
| 5 | `alley_boss` | **Trùm hẻm** | b / 2 / 0 | leather_vest, iron_knuckles, leather_cap | `an imposing back-alley boss with a scar, leather vest, leather cap and iron knuckles, cocky stance` |
| 6 | `novice` | Chú tiểu | a / 1 / 3 | patched_tunic, bo_staff, straw_sandals | `a cheerful young temple novice with a bo staff and straw sandals` |
| 7 | `wandering_monk` | Nhà sư du phương | b / 0 / 3 | leather_vest, bo_staff, lucky_coin | `a serene travelling monk, broad and strong, with a bo staff and a lucky coin necklace` |
| 8 | `fan_dancer` | Vũ công quạt | a / 1 / 2 | leather_vest, swift_boots, jade_charm | `a graceful fighter with long side-swept hair, light boots and a jade pendant, elegant pose` |
| 9 | `iron_guard` | Lính gác sắt | b / 2 / 0 | scale_mail, iron_helm, walking_stick | `a stern gate guard in scale mail and an iron helm, holding a stick like a baton` |
| 10 | `iron_general` | **Tướng thép** | b / 3 / 1 | scale_mail, iron_helm, iron_knuckles, bo_staff | `a towering general in polished scale mail, crested iron helm, iron knuckles and a staff, commanding presence` |
| 11 | `wind_walker` | Kẻ lướt gió | a / 0 / 1 | leather_vest, swift_boots, bo_staff | `a quick, light-footed fighter with spiky hair and swift boots, wind streaks around the feet` |
| 12 | `jade_duelist` | Kiếm khách ngọc | a / 2 / 2 | scale_mail, twin_blades, jade_charm | `a poised duelist with twin blades and a jade pendant, cool expression` |
| 13 | `mirror` | Bóng gương | (giống người chơi) | | **Không vẽ.** Đối thủ này luôn vẽ giống người chơi. |
| 14 | `thunder_fist` | Quyền sấm | b / 1 / 3 | scale_mail, iron_knuckles, swift_boots | `a powerful brawler with a topknot and iron knuckles crackling with small blue sparks` |
| 15 | `tower_master` | **Chủ tháp** | b / 3 / 2 | scale_mail, iron_helm, twin_blades, phoenix_feather, swift_boots | `the master of the tower: ornate scale mail, crested helm, twin glowing blades and a phoenix feather, a faint fiery aura` |

Đối thủ chỉ nhận hình riêng khi file có trong `manifest.json` (script tự khai
báo `opponent/{mã}`).

## 7. Sau này: động tác thật (tuỳ chọn)

Khi muốn mỗi động tác có nhiều khung (sheet 2560 × 2304, xem
`arena-sprites.md`), làm cho **một nhân vật nguyên khối**, thường là trùm, thay
vì từng lớp. Với mỗi động tác, dùng ảnh nhân vật làm tham chiếu (`--cref`,
hoặc tải lên):

```text
Same character, same outfit, same proportions and art style as the reference.
Side view facing right, transparent background. Pose: {POSE}.
```

| Hàng | Động tác | `{POSE}` (mỗi khung một ảnh) |
| --- | --- | --- |
| 0 | idle | `guard stance, breathing; frames shift weight slightly up and down` |
| 1 | walk | `stepping forward in guard, left and right foot alternating` |
| 2 | light | `a quick straight jab with the front fist: wind-up, extend, full reach, return` |
| 3 | heavy | `a powerful roundhouse kick (or weapon swing): chamber, pivot, impact, follow-through, recover` |
| 4 | special | `charging glowing energy in both hands, then a lunging strike releasing a burst of light` |
| 5 | block | `both forearms raised in front of the face, bracing` |
| 6 | hit | `recoiling backward from a blow, head snapped back, wincing` |
| 7 | ko | `staggering, knees buckling, falling backward, lying flat on the ground` |
| 8 | win | `victory pose: fist raised to the sky, confident grin` |

Ghép các khung vào lưới 10 cột × 9 hàng, mỗi ô 256 px, ô thừa để trống. Mọi
file đều phải cùng một kiểu: script từ chối manifest trộn cả ảnh một tư thế và
sheet 9 hàng.

## 8. Kiểm tra trước khi nộp

- [ ] Tối ưu: `pngquant --quality 70-90` hoặc `oxipng`.
- [ ] Đúng 256 × 256 (hoặc 2560 × 2304 nếu là sheet).
- [ ] Nền trong suốt, không viền trắng quanh nhân vật.
- [ ] Quay mặt sang phải.
- [ ] Chân ở y = 240 và người giữa x = 128: chồng thử lớp mới lên thân xem có
      lệch không.
- [ ] Đúng tên file (chữ thường, đúng mã).
- [ ] Không chữ, không logo, không giống nhân vật game khác.
- [ ] Chạy `npm run arena:manifest` không báo lỗi.
- [ ] Mở `/arena` (bằng `npm run dev`) xem võ sĩ, rồi vào một trận để xem các
      động tác.
