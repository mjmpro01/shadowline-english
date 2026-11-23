# Hình cho Đấu trường: định dạng sprite

Tài liệu này dành cho người vẽ (hoặc tạo) hình võ sĩ cho Đấu trường. App đã
chạy được khi chưa có hình nào: võ sĩ được vẽ tạm bằng SVG. Khi các file dưới
đây có mặt, app tự dùng hình thật thay cho hình tạm.

Nhân vật, trang phục và phong cách phải là **của riêng Shadowline**: không lấy
nhân vật, hình, tên hay logo của game khác.

Tạo hình bằng AI? Xem [`arena-sprite-prompts.md`](arena-sprite-prompts.md): bộ
prompt cho từng lớp, và cách làm để các lớp khớp nhau.

## 1. Khung hình

- Mỗi khung (frame) là **256 × 256 px**, nền trong suốt (PNG).
- Võ sĩ **quay mặt sang phải**. App tự lật khi cần quay trái.
- Chân chạm "mặt đất" ở **y = 240**, giữa người ở **x = 128**, ở mọi khung và
  mọi lớp, để các lớp chồng khít lên nhau.

## 2. Động tác

Mỗi file là một **sprite sheet**: mỗi hàng là một động tác, mỗi cột là một
khung, theo đúng thứ tự hàng dưới đây.

| Hàng | Động tác | Số khung | fps | Ghi chú |
| --- | --- | --- | --- | --- |
| 0 | `idle` | 6 | 8 | Đứng thủ, lặp |
| 1 | `walk` | 8 | 12 | Bước lên, lặp |
| 2 | `light` | 5 | 14 | Đòn nhẹ (đấm nhanh) |
| 3 | `heavy` | 7 | 14 | Đòn nặng (đá, vung vũ khí) |
| 4 | `special` | 10 | 14 | Tuyệt chiêu, khi đầy thanh nộ |
| 5 | `block` | 3 | 10 | Đỡ đòn |
| 6 | `hit` | 3 | 12 | Trúng đòn |
| 7 | `ko` | 6 | 10 | Gục, giữ khung cuối |
| 8 | `win` | 6 | 8 | Ăn mừng |

Một sheet đủ 9 hàng, rộng bằng số khung nhiều nhất, tức là
**10 × 256 = 2560 px** và cao **9 × 256 = 2304 px**. Ô thừa ở các hàng ngắn để
trống.

### Chế độ một tư thế (khuyên dùng khi tạo hình bằng AI)

Thay vì sheet 9 hàng, mỗi file có thể chỉ là **một khung 256 × 256** ở tư thế
đứng thủ. App dùng khung đó cho mọi động tác và tự làm chuyển động: lao tới khi
đánh, rung khi trúng đòn, ngã khi KO, nhún khi thắng, giống hình tạm.

Mọi file phải cùng một kiểu: hoặc đều một tư thế, hoặc đều là sheet đủ 9 hàng.

## 3. Các lớp (paper-doll)

Võ sĩ được ghép từ nhiều lớp chồng lên nhau, **cùng khung hình, cùng động tác**,
nên đồ mua về hiện đúng trên người. Thứ tự vẽ từ dưới lên:

1. `base/{dáng}-{màu da}.png`: thân người trần. Có 2 dáng (`a`, `b`) và 4 màu
   da (`0`–`3`), tổng cộng 8 file.
2. Trang bị theo thứ tự `feet`, `body`, `hands`, `head`, `weapon`, `charm`:
   `gear/{mã món}.png`, mỗi món một file.
3. `hair/{dáng}-{kiểu tóc}.png`: tóc ở trên cùng. Có 2 dáng × 4 kiểu, tổng cộng
   8 file.

Mã các món (xem `server/internal/arena/catalog.go`):

| Ô | Mã |
| --- | --- |
| Áo | `rags` (áo rách, đồ ăn mày), `patched_tunic`, `leather_vest`, `scale_mail` |
| Tay | `bare_fists` (tay không, có thể để trống), `cloth_wraps`, `leather_gloves`, `iron_knuckles` |
| Chân | `bare_feet` (chân đất, có thể để trống), `straw_sandals`, `swift_boots` |
| Đầu | `straw_hat`, `leather_cap`, `iron_helm` |
| Vũ khí | `walking_stick`, `bo_staff`, `twin_blades` |
| Bùa | `lucky_coin`, `jade_charm`, `phoenix_feather` |

Với `bare_fists` và `bare_feet` có thể nộp một PNG trong suốt cùng kích thước.

## 4. Đặt file và khai báo

Đặt tất cả vào `app/public/arena/` (thư mục `base/`, `hair/`, `gear/`,
`opponents/`) rồi chạy:

```sh
cd app && npm run arena:manifest
```

Script đọc kích thước từng PNG và báo lỗi nếu sai cỡ, thiếu nền trong suốt hoặc
trộn hai kiểu. Sau đó nó ghi `app/public/arena/manifest.json` và liệt kê các lớp
còn thiếu. Không cần viết tay. File có dạng:

```json
{
  "frame": 256,
  "animations": {
    "idle": { "row": 0, "frames": 6, "fps": 8 },
    "walk": { "row": 1, "frames": 8, "fps": 12 },
    "light": { "row": 2, "frames": 5, "fps": 14 },
    "heavy": { "row": 3, "frames": 7, "fps": 14 },
    "special": { "row": 4, "frames": 10, "fps": 14 },
    "block": { "row": 5, "frames": 3, "fps": 10 },
    "hit": { "row": 6, "frames": 3, "fps": 12 },
    "ko": { "row": 7, "frames": 6, "fps": 10 },
    "win": { "row": 8, "frames": 6, "fps": 8 }
  },
  "layers": {
    "base/a-0": "base/a-0.png",
    "hair/a-0": "hair/a-0.png",
    "gear/rags": "gear/rags.png",
    "gear/bare_fists": "gear/bare_fists.png",
    "gear/bare_feet": "gear/bare_feet.png",
    "gear/straw_hat": "gear/straw_hat.png"
  }
}
```

Một võ sĩ chỉ hiện bằng hình thật khi **mọi lớp** của họ (thân, từng món đang
mặc, tóc) đều có trong `layers`. Thiếu bất kỳ lớp nào, app vẽ hình tạm cho cả
võ sĩ đó. Nhờ vậy có thể giao hình dần dần: thêm lớp nào thì lớp đó có hiệu lực
ngay khi bộ đồ của võ sĩ đã đủ.

## 5. Đối thủ (tháp đấu chữ)

Mười lăm đối thủ của tháp được ghép **từ chính các lớp ở trên**: mỗi người có
dáng, màu da, kiểu tóc và bộ đồ lấy trong danh mục (xem
`server/internal/arena/tower.go`). Vì vậy khi thân, tóc và đồ đã có hình thì đối
thủ cũng có hình, không cần vẽ riêng. Tầng 13 ("Bóng gương") vẽ giống hệt người
chơi.

Muốn một đối thủ có hình riêng hoàn toàn (thường là trùm ở tầng 5, 10, 15), có thể
nộp một sheet đủ 9 hàng động tác: `opponents/{mã}.png`, khai báo trong `layers`
với tên `opponent/{mã}`. Mã các tầng: `pickpocket`, `dockhand`, `market_bully`,
`stick_fighter`, `alley_boss`, `novice`, `wandering_monk`, `fan_dancer`,
`iron_guard`, `iron_general`, `wind_walker`, `jade_duelist`, `mirror`,
`thunder_fist`, `tower_master`.

## 6. Gợi ý khi vẽ

- Giữ dáng đứng thủ ở cùng một chỗ trong khung. Các động tác tấn công có thể
  vươn ra nhưng không vượt khung 256 px.
- Đồ ăn mày (`rags`) nên nhìn thật nghèo: vá víu, rách gấu. Đồ hiếm và huyền
  thoại nên nổi bật về màu.
- Tối ưu PNG (pngquant/oxipng) trước khi nộp. Mỗi sheet nên dưới khoảng 300 KB.
