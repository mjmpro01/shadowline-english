# Prompt tạo âm thanh cho Đấu trường

Hiện mọi âm thanh trận đấu được tổng hợp bằng Web Audio trong
`app/src/lib/sfx.ts`, và cả 6 loại tuyệt chiêu dùng chung một tiếng. Tài liệu này
là bộ prompt để tạo âm riêng cho từng kỹ năng bằng công cụ AI tạo hiệu ứng âm
thanh.

## Cách làm

1. Dùng một công cụ tạo hiệu ứng âm thanh từ chữ, ví dụ **ElevenLabs Sound
   Effects** hoặc **Stable Audio**. Kiểm tra điều khoản: âm thanh phải được phép
   dùng trong app phát hành (thường cần gói trả phí).
2. Mỗi âm: dán **dòng phong cách chung** rồi dán prompt riêng của âm đó. Đặt độ
   dài theo gợi ý nếu công cụ cho chỉnh.
3. Tạo 3–4 bản cho mỗi âm và giữ bản hay nhất. Tải về dạng MP3 hoặc WAV, **đặt
   đúng tên file** như bảng dưới.
4. Nén tất cả vào một file zip rồi gửi. Bên app sẽ cắt khoảng lặng, cân âm
   lượng, nén nhỏ và gắn vào. Âm nào chưa có thì vẫn dùng âm tổng hợp như cũ.

Luật chung:
- Không lời nói, không nhạc nền lặp.
- Không đặt tên hay bắt chước âm thanh của game có sẵn.

## Dòng phong cách chung (dán trước mỗi prompt)

```
Short sound effect for an original 16-bit pixel-art martial-arts game. Punchy and clean, starts instantly, no music, no voice or words, short tail, mono.
```

## 6 tuyệt chiêu (cần có)

| File | Kỹ năng | Prompt | Độ dài |
| --- | --- | --- | --- |
| `crit.mp3` | Chí mạng | `A fast sharp whoosh, then one devastating cracking impact with a deep bass thump and a brief bright metallic ring.` | < 1 s |
| `combo.mp3` | Liên hoàn | `Two rapid punches in quick succession, the second one higher-pitched and stronger, crisp snappy impacts.` | 0.6 s |
| `drain.mp3` | Hút máu | `Dark life-drain spell: a low wobbling pulse sliding downward, like energy being pulled away, with a faint eerie hiss.` | 0.8 s |
| `heal.mp3` | Hồi máu | `Gentle healing spell: a bright rising chime arpeggio with soft sparkles, warm and uplifting.` | 0.8 s |
| `stun.mp3` | Choáng | `A solid cartoonish bonk impact, then a short dizzy warbling ring, like seeing stars.` | 0.8 s |
| `focus.mp3` | Tập trung | `Two crisp clock ticks, then a high shimmering tone that hangs briefly, calm and clear.` | 0.8 s |

## Bộ cơ bản (không bắt buộc, thay âm tổng hợp hiện có)

| File | Khi nào | Prompt | Độ dài |
| --- | --- | --- | --- |
| `light.mp3` | đòn nhanh | `A quick light jab hitting cloth, snappy.` | 0.3 s |
| `heavy.mp3` | đòn mạnh | `A heavy kick impact with a solid low thud.` | 0.5 s |
| `block.mp3` | đỡ đòn | `A metallic clang of a successful parry, short ring.` | 0.5 s |
| `hit.mp3` | bị đánh | `Taking a hit: a dull body thud with a short grunt-free whoosh.` | 0.4 s |
| `ko.mp3` | bị hạ | `A falling descending tone, then a body hitting the ground.` | 1.2 s |
| `win.mp3` | thắng | `A short triumphant 8-bit victory fanfare.` | 1.5 s |
| `tick.mp3` | 3 giây cuối | `A soft single clock tick.` | 0.2 s |
