# Hình cho Đấu trường: sprite đồng bộ theo frame

Tài liệu này dành cho người vẽ (hoặc tạo) hình võ sĩ cho Đấu trường. App vẫn chạy
khi chưa có hình nào, vì võ sĩ được vẽ tạm bằng SVG. Khi các file dưới đây có
mặt, app tự dùng hình thật thay cho hình tạm.

Nhân vật, trang phục và phong cách phải là **của riêng Shadowline**: không lấy
nhân vật, hình, tên hay logo của game khác.

Tạo hình bằng AI? Xem [`arena-sprite-prompts.md`](arena-sprite-prompts.md): bộ
prompt cho từng lớp, từng frame, và cách làm để các lớp khớp nhau.

## 0. Ý tưởng: paper doll đồng bộ theo frame

Võ sĩ được ghép từ nhiều **lớp** chồng lên nhau: thân, các món đồ đang mặc, tóc.
Mọi lớp của một võ sĩ tuân theo cùng ba thứ:

1. **Cùng một canvas**, cùng góc nhìn (3/4, quay mặt sang phải) và cùng điểm đặt
   chân.
2. **Cùng tư thế ở mỗi frame.** Frame `light-2` của chiếc găng được vẽ đúng lên
   bàn tay của frame `light-2` của thân.
3. **Cùng thứ tự frame ở cùng ô của sheet.**

App chỉ có **một đồng hồ cho mỗi võ sĩ**, và mọi lớp cùng hiện đúng một số frame
tại cùng một lúc. Nhờ vậy thay đồ thì linh hoạt mà animation không bao giờ lệch:
thanh kiếm luôn nằm trong bàn tay đang cầm nó.

## 1. Khung hình

- Có hai cỡ khung, PNG nền trong suốt:
  - **64 × 64 px, pixel art** (khuyên dùng). App phóng to bằng pixel vuông sắc
    nét. **Chân chạm đất ở y = 60**, giữa người ở **x = 32**.
  - **256 × 256 px**, hình vẽ thường. Chân ở **y = 240**, giữa người ở
    **x = 128**.
- Mọi file phải cùng một cỡ khung.
- Võ sĩ **quay mặt sang phải**. App tự lật khi cần quay trái.

## 2. Sheet: 6 hàng động tác, mỗi hàng tối đa 4 frame

Mỗi hàng là một động tác, mỗi cột là một frame, theo đúng thứ tự dưới đây. Một
sheet khung 64 rộng **256 px** (4 frame) và cao **384 px** (6 hàng); khung 256
thì là 1024 × 1536. Ô thừa ở các hàng ngắn **phải để trống**.

| Hàng | Động tác | Frame | fps | Chạy | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 4 | 6 | lặp | Đứng thủ, thở |
| 1 | `light` | 4 | 14 | một lần | Đấm nhanh |
| 2 | `heavy` | 4 | 12 | một lần | Đá hoặc vung vũ khí |
| 3 | `hit` | 2 | 10 | một lần | Trúng đòn, giật lùi |
| 4 | `ko` | 4 | 8 | một lần, giữ frame cuối | Gục, nằm xuống |
| 5 | `win` | 4 | 8 | lặp | Ăn mừng, được nhảy lên |

Tổng cộng **22 frame cho mỗi lớp**. Ba động tác không có hàng riêng mượn hàng có
sẵn và chuyển động bằng CSS:
- `walk` dùng `idle`;
- `special` (tuyệt chiêu) dùng `heavy`, kèm vầng sáng;
- `block` (đỡ đòn) dùng `idle`.

### Một tư thế

Một lớp cũng có thể chỉ là **một khung** (64 × 64) ở tư thế đứng thủ. Khi đó app
dùng khung ấy cho mọi động tác và tự làm chuyển động bằng CSS: lao tới, rung khi
trúng đòn, ngã khi KO. Đây là cách các lớp hiện có đang chạy.

**Một võ sĩ chỉ hoạt hình bằng frame khi mọi lớp của họ đều là sheet.** Nếu thân
đã là sheet mà còn một món đồ là một tư thế, võ sĩ đó vẽ tạm cho tới khi món ấy
có sheet: chiếc mũ đứng yên trên cái đầu đang động thì không còn là đồng bộ.
Script báo rõ những lớp nào đang kìm võ sĩ lại.

## 3. Các lớp

Thứ tự vẽ, từ dưới lên:

1. **Lớp sau** (nếu có): tóc rồi đồ, tên kết thúc bằng `.back`. Đây là tóc dài
   buông sau vai, áo choàng, lưỡi kiếm ở tay phía xa, những thứ phải nằm *sau*
   thân.
2. `base/{dáng}-{màu da}.png`: thân người trần. Dáng `a` là **nam**, `b` là
   **nữ**; màu da `0`–`3`. Tổng cộng 8 file.
3. Đồ đang mặc, theo thứ tự `feet`, `body`, `hands`, `head`, `weapon`, `charm`:
   `gear/{mã}.png`.
4. `hair/{dáng}-{kiểu}.png`: tóc trên cùng. 2 dáng × 4 kiểu, tổng cộng 8 file.

### Bản riêng cho từng dáng

Thân nam và thân nữ là hai tư thế khác nhau, nên một món đồ có thể có:
- **một bản chung**: `gear/rags.png`;
- **hoặc một bản cho từng dáng**: `gear/rags@a.png` (nam) và `gear/rags@b.png`
  (nữ).

Bản riêng của dáng được ưu tiên. Một món **chỉ có bản `@a`** thì võ sĩ nữ mặc nó
vẫn vẽ tạm cho tới khi có `@b`. Lớp sau cũng theo quy tắc này:
`gear/twin_blades@b.back.png`.

### Mã các món

Xem `server/internal/arena/catalog.go`.

| Ô | Mã |
| --- | --- |
| Áo | `rags` (đồ ăn mày), `patched_tunic`, `leather_vest`, `scale_mail` |
| Tay | `bare_fists` (tay không), `cloth_wraps`, `leather_gloves`, `iron_knuckles` |
| Chân | `bare_feet` (chân đất), `straw_sandals`, `swift_boots` |
| Đầu | `straw_hat`, `leather_cap`, `iron_helm` |
| Vũ khí | `walking_stick`, `bo_staff`, `twin_blades` |
| Bùa | `lucky_coin`, `jade_charm`, `phoenix_feather` |

`bare_fists` và `bare_feet` là PNG trong suốt hoàn toàn, cùng cỡ với thân.

## 4. Làm sheet từ từng frame

Vẽ (hoặc tạo) từng frame thành một PNG riêng, đặt theo lớp và tên động tác:

```
app/art/arena-frames/base/a-0/idle-1.png … idle-4.png, light-1.png … win-4.png
app/art/arena-frames/gear/rags@b/idle-1.png …
app/art/arena-frames/hair/b-2.back/idle-1.png …
```

rồi ghép:

```sh
cd app && npm run arena:sheet            # mọi lớp
cd app && npm run arena:sheet -- base/a-0  # một lớp
```

Lệnh này ghi sheet vào `app/public/arena/<lớp>.png`. Frame thiếu được để trống
và có cảnh báo; frame ngoài bảng ở mục 2 bị từ chối.

**Thứ tự làm:** vẽ đủ 22 frame của **thân** trước, coi đó là template. Mỗi frame
của tóc và đồ được vẽ **đè lên đúng frame cùng tên của thân**, rồi chỉ giữ lại
phần món đó. Vì vậy chúng tự khớp.

## 5. Khai báo và kiểm tra

```sh
cd app && npm run arena:manifest
```

Script đọc từng PNG, kiểm tra rồi ghi `app/public/arena/manifest.json`. Không cần
viết tay. Các kiểm tra:

- **Cỡ:** một tư thế (64 × 64 hoặc 256 × 256) hoặc sheet (256 × 384 hoặc
  1024 × 1536), và mọi file cùng một cỡ khung.
- **Từng frame của thân và đối thủ:** đủ frame mỗi hàng, và **chân trên vạch đất
  ở mọi frame** (±1 px; `win` được nhảy lên nhưng không được lún xuống). Thân lệch
  thì mọi món đồ lệch theo, nên đây là kiểm tra quan trọng nhất.
- **Mọi lớp:** không có hình ở ô vượt quá số frame của hàng.
- **Trong suốt:** báo nếu file không có kênh alpha.
- **Còn thiếu:** liệt kê lớp còn thiếu, và những lớp một tư thế đang kìm một thân
  đã có sheet.

Lỗi được ghi kèm tên file, động tác và số frame, ví dụ
`base/a-0.png: heavy frame 3 chân ở y=56, phải ở y=60 (±1)`. Khi còn lỗi,
manifest không được ghi.

## 6. Đối thủ (tháp đấu chữ)

Mười lăm đối thủ của tháp được ghép **từ chính các lớp ở trên**: mỗi người có
dáng, màu da, kiểu tóc và bộ đồ lấy trong danh mục (xem
`server/internal/arena/tower.go`). Khi các lớp ấy đã có hình thì đối thủ cũng có
hình. Tầng 13 ("Bóng gương") luôn vẽ giống người chơi.

Muốn một đối thủ có hình riêng hoàn toàn (thường là trùm ở tầng 5, 10, 15), nộp
`opponents/{mã}.png`: một tư thế hoặc một sheet 6 hàng, kiểm tra như một thân.
Mã các đối thủ:
- `pickpocket`, `dockhand`, `market_bully`, `stick_fighter`, `alley_boss`;
- `novice`, `wandering_monk`, `fan_dancer`, `iron_guard`, `iron_general`;
- `wind_walker`, `jade_duelist`, `mirror`, `thunder_fist`, `tower_master`.

## 7. Gợi ý khi vẽ

- Giữ chân trên vạch đất ở mọi frame. Đòn đánh có thể vươn ra trước, KO nằm
  xuống đất, nhưng không được ra ngoài khung.
- Đồ ăn mày (`rags`) nên trông thật nghèo: vá víu, rách gấu. Đồ hiếm và huyền
  thoại nên nổi bật về màu.
- Tối ưu PNG (pngquant/oxipng) trước khi nộp. Script đọc được PNG 8-bit kiểu
  bảng màu của pngquant.
