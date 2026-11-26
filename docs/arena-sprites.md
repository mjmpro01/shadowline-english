# Hình cho Đấu trường: nhân vật vẽ nguyên con

Tài liệu này dành cho người vẽ (hoặc tạo) hình nhân vật cho Đấu trường. App vẫn
chạy khi chưa có hình nào, vì nhân vật được vẽ tạm bằng SVG theo màu và kiểu vũ
khí của họ. Khi có file của nhân vật nào, app tự dùng hình thật cho nhân vật đó.

Nhân vật, trang phục và phong cách phải là **của riêng Shadowline**: không lấy
nhân vật, hình, tên hay logo của game khác.

Tạo hình bằng AI? Xem [`arena-character-prompts.md`](arena-character-prompts.md):
prompt cho 24 nhân vật và khung mẫu
[`arena/character-template.png`](arena/character-template.png).

## 1. Mỗi nhân vật là một hình nguyên con

Có 24 nhân vật, 4 bậc × 6 (xem `server/internal/arena/characters.go`). Mỗi
người được vẽ **nguyên con, cầm sẵn vũ khí**, trong một sheet. Không có lớp tóc,
áo hay đồ chồng lên nhau.

- Khung **64 × 64 px, pixel art**, PNG nền trong suốt. App phóng to bằng pixel
  vuông sắc nét. (Khung 256 × 256 cho hình vẽ thường vẫn được nhận, nhưng mọi
  file phải cùng một cỡ.)
- **Chân chạm đất ở y = 60**, giữa người ở **x = 32**.
- Nhân vật **quay mặt sang phải**. App tự lật khi cần quay trái.
- Đứng thẳng, nhân vật cao khoảng 48–52 px, để chừa chỗ cho vũ khí và hiệu ứng.
  Không có gì được ra ngoài khung.

## 2. Sheet: 7 hàng động tác, mỗi hàng tối đa 4 frame

Mỗi hàng là một động tác, mỗi cột là một frame, theo đúng thứ tự dưới đây. Một
sheet khung 64 rộng **256 px** và cao **448 px**. Ô thừa ở các hàng ngắn **phải
để trống**.

| Hàng | Động tác | Tên frame | Frame | fps | Chạy | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | `idle-1..4` | 4 | 6 | lặp | Đứng thủ, thở |
| 1 | `light` | `light-1..4` | 4 | 14 | một lần | Đòn nhanh |
| 2 | `heavy` | `heavy-1..4` | 4 | 12 | một lần | Đòn mạnh |
| 3 | `hit` | `hit-1..2` | 2 | 10 | một lần | Trúng đòn, giật lùi |
| 4 | `ko` | `ko-1..4` | 4 | 8 | một lần, giữ frame cuối | Gục, nằm xuống; đang ngã thì chân được rời đất |
| 5 | `win` | `win-1..4` | 4 | 8 | lặp | Ăn mừng, được nhảy lên |
| 6 | `special` | `skill-1..4` | 4 | 10 | một lần | **Tuyệt chiêu riêng** của nhân vật; được rời đất |

Tổng cộng **26 frame mỗi nhân vật**. `walk` (bước) và `block` (đỡ đòn) không có
hàng riêng: chúng mượn `idle` và chuyển động bằng CSS. Lúc tung tuyệt chiêu, app
còn thêm một quầng sáng theo màu của loại tuyệt chiêu (chí mạng cam, hồi máu
xanh lá, hút máu đỏ, choáng vàng, tập trung xanh dương).

### Một tư thế, sheet, hay cả hai

Mỗi nhân vật có thể có:
- **một tư thế**: `characters/{mã}.png`, một khung đứng thủ. App dùng khung ấy
  cho mọi động tác và tự làm chuyển động bằng CSS;
- **một sheet**: `characters/{mã}.sheet.png`, đủ 26 frame, hoạt hình từng frame;
- **hoặc cả hai, đặt cạnh nhau**: sheet được ưu tiên.

## 3. Làm sheet từ từng frame

Cắt (hoặc vẽ) từng frame thành một PNG riêng, đặt theo nhân vật và tên frame:

```
app/art/arena-frames/characters/beggar/idle-1.png … win-4.png, skill-1.png … skill-4.png
```

rồi ghép:

```sh
cd app && npm run arena:sheet                          # mọi nhân vật
cd app && npm run arena:sheet -- characters/beggar     # một nhân vật
```

Lệnh này ghi `app/public/arena/characters/{mã}.sheet.png`. Frame thiếu được để
trống và có cảnh báo; frame ngoài bảng ở mục 2 bị từ chối. Thư mục
`app/art/arena-frames/` được giữ trong repo làm bản gốc để sửa về sau.

Ảnh do AI tạo trên khung mẫu 26 ô thì gửi cho Claude: Claude cắt nền, đưa về
cùng tỉ lệ, căn chân lên vạch đất, ghép sheet và kiểm tra.

## 4. Khai báo và kiểm tra

```sh
cd app && npm run arena:manifest
```

Script đọc từng PNG trong `public/arena/characters/`, kiểm tra rồi ghi
`app/public/arena/manifest.json`. Không cần viết tay. Các kiểm tra:

- **Cỡ:** một tư thế phải là 64 × 64 (hoặc 256 × 256), sheet phải là 256 × 448
  (hoặc 1024 × 1792), và mọi file cùng một cỡ khung.
- **Từng frame:** đủ frame mỗi hàng, không có hình ở ô thừa, và **chân trên vạch
  đất** (±1 px; `ko`, `win` và `special` được rời mặt đất nhưng không được lún
  xuống).
- **Trong suốt:** báo nếu file không có kênh alpha.
- **Còn thiếu:** liệt kê nhân vật chưa có hình, và nhân vật chưa có sheet.

Lỗi được ghi kèm tên file, động tác và số frame, ví dụ
`characters/beggar.sheet.png: heavy frame 3 chân ở y=56, phải ở y=60 (±1)`. Khi
còn lỗi, manifest không được ghi.

## 5. Đối thủ

Mười lăm đối thủ của tháp là **chính các nhân vật này** (xem
`server/internal/arena/tower.go`), nên khi một nhân vật có hình thì đối thủ ấy
cũng có. Tầng 13 ("Bóng gương") luôn vẽ giống nhân vật người chơi đang dùng.
Bóng của người học khác vẽ theo nhân vật của họ.

## 5b. Nền trận đấu

Mỗi chặng tháp có một nền riêng, và đấu với người có sàn đấu riêng:

| Nền | File | Dùng cho |
| --- | --- | --- |
| Chợ ven sông | `public/arena/stages/market.png` | tầng 1–5 |
| Đền trên núi | `public/arena/stages/temple.png` | tầng 6–10 |
| Đỉnh tháp | `public/arena/stages/tower.png` | tầng 11–15 |
| Sàn đấu | `public/arena/stages/arena.png` | đấu với bóng người khác |

- Ảnh rộng gấp **3 lần** cao, ít nhất **384×128** (ảnh tạo ra ~2000×667 được
  thu về 384×128, 32 màu, để hợp với nhân vật pixel). Ảnh gốc để ở
  `art/arena-stages/`.
- Dải đất phẳng ở ~20% dưới cùng: chân võ sĩ đứng trên đó. Không người, không chữ.
- Trang tự phủ một lớp mờ nhẹ để võ sĩ nổi lên; tầng trùm (5, 10, 15) tối hơn.
  Điện thoại cắt bớt hai bên.
- Chạy `npm run arena:manifest`: nền sai tỉ lệ là lỗi; nền chưa có chỉ được liệt
  kê, trận đó dùng nền mặc định.

## 6. Gợi ý khi vẽ

- Giữ nhân vật cùng cỡ ở mọi frame, chân trên vạch đất. Đòn đánh có thể vươn ra
  trước, KO nằm xuống đất, nhưng không được ra ngoài khung.
- Bậc càng cao càng nổi bật về màu và hiệu ứng: Thường giản dị, Huyền thoại rực rỡ.
- Tối ưu PNG (pngquant/oxipng) trước khi nộp. Script đọc được PNG 8-bit kiểu
  bảng màu của pngquant.
