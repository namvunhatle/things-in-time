# things i couldn't say in time

Một archive riêng tư, theo thời gian. Không analytics, không feed mạng xã hội, không autoplay, không ảnh hay nhạc tải từ bên thứ ba khi đọc.

## Thêm một dump

1. Chạy `npm run entry -- ten-entry` để tạo một file có ngày/giờ Việt Nam trong `.confidential/entries/`. Hoặc copy một file từ `content/examples/` vào thư mục confidential với tên mới.
2. Viết dưới dấu `---` thứ hai. Không cần sửa UI. Một dòng trống tách hai đoạn.
3. Xóa `draft: true` khi muốn hiển thị.
4. Chạy `npm run check`, rồi `npx vercel --prod` để cập nhật site. Local Markdown không tự upload khi save.

Ba entry đang hiển thị lấy nguyên văn từ ví dụ trong brief. Ngày là ngày dựng bản mẫu. Chúng là nội dung mẫu, không phải lời ghi chép mới được viết thay bạn. Các ví dụ ảnh, nhạc, mixed và unfinished nằm riêng trong `content/examples/`, không xuất hiện trên site.

### Header của entry

```yaml
---
date: "2026-10-05"
time: "02:47" # tùy chọn; giờ Việt Nam, định dạng 24h
kind: dump # dump / line / realization / memory / song
category: unsaid # tùy chọn: understood / miss / songs / home / unsaid
lang: en # entry được publish phải là English
tags: [một điều nhỏ] # tùy chọn
draft: true # xóa dòng này khi sẵn sàng
---
```

Mới nhất ở trên. Entry không có giờ được xếp ở đầu ngày, trước các ngày cũ hơn. Cùng ngày/giờ thì tên file quyết định thứ tự. `kind` chỉ điều chỉnh nhịp trình bày; `category` quyết định filter.

### Ảnh

Lưu ảnh riêng trong `.confidential/photos/`, rồi thêm ảnh vào bất kỳ vị trí nào giữa các đoạn:

```md
![mô tả để đọc bằng screen reader](/media/home.jpg "caption tùy chọn")
```

Tên file chỉ dùng chữ/số, dấu gạch ngang, gạch dưới và dấu chấm. JPEG/PNG/WebP/AVIF/GIF được hỗ trợ. Ảnh không nằm trong `public/`; mỗi request tới ảnh đều kiểm tra session. Nén ảnh trước khi thêm; nếu muốn bỏ vị trí GPS thì export bản không chứa metadata trước. Không có ảnh cá nhân nào được tự lấy từ những file khác của bạn.

### Nhạc

Thêm `song:` trong header; xem `content/examples/song.md`. Có title, artist, link HTTPS, lyric tùy chọn tối đa 10 từ. `art: /media/album.jpg` thêm ảnh bìa tùy chọn, cũng được bảo vệ bằng passcode. Ghi chú nằm trong phần Markdown. Không embed tự tải để tránh gửi dữ liệu sang dịch vụ nghe nhạc. Link chỉ mở khi người đọc bấm.

## Chạy local

```sh
npm install
npm run setup
# Passcode nằm trong .env.local; giữ file này riêng tư.
npm run dev
```

Mở http://127.0.0.1:3000. `npm run build` kiểm tra nội dung và build production; `npm start` chạy bản production.

## Portal và archive canvas

Mở `http://127.0.0.1:3000/portal` để tạo account tối giản bằng username/password, xem dashboard và tạo archive mới. Không cần email. Password account được hash bằng scrypt; session nằm trong cookie HttpOnly 30 ngày. Đăng nhập lại sẽ thấy các draft cũ và mở editor bằng URL ổn định.

Archive cũ chưa có owner sẽ tự gắn vào account khi browser hiện tại vẫn còn editor session hợp lệ. Recovery link tiếp tục hoạt động như fallback. Mỗi archive có:

- editor URL ổn định chỉ account owner hoặc recovery session mở được
- share URL chỉ để xem
- password riêng cho share view; server chỉ lưu hash
- text dump viết trực tiếp trên canvas, cùng nhịp chữ với archive gốc
- thả ảnh lên một note để ảnh nằm cạnh và đi theo note; ảnh vẫn kéo chỉnh riêng được
- ảnh cũng có thể được thả tự do; JPG/PNG/WebP/GIF/AVIF, tối đa 10 MB mỗi file
- dán link YouTube, youtu.be hoặc Shorts để tạo video card kéo-thả; thumbnail được cache riêng trong archive và player chỉ tải sau khi người xem bấm play

Dữ liệu demo nằm trong `.archive-data/` và bị Git ignore. Share URL local chỉ hoạt động trên chính máy đang chạy server. Trước khi gửi link qua internet hoặc deploy lên Vercel, cần thay local filesystem bằng persistent database + object storage; filesystem của serverless deployment không phải nơi lưu archive lâu dài.

## Trạng thái kiểm tra — 05/10/2026

Dependencies đã cài đủ. Production build Next.js 16.3.8 đã thành công. Kiểm tra nội dung, thứ tự thời gian, filter, loại draft và nhãn ngày/giờ đã qua. Logic passcode đã qua kiểm tra: đóng khi thiếu cấu hình, đúng/sai mã, chữ ký, thời hạn và thu hồi session khi đổi mã. Review source đã kiểm tra noindex, bảo vệ media và nội dung mẫu. Chưa xác nhận giao diện trong trình duyệt hoặc deployment: môi trường thực thi chặn truy cập mạng và chặn mở cổng localhost. Không có URL production đã được xác nhận.

## Vercel

Cách ngắn nhất, khi terminal có mạng và đã đăng nhập Vercel:

```sh
npm run publish
```

Lệnh này cài dependencies, tạo passcode riêng trong `.env.local` nếu chưa có, chạy production build, tạo project có tên ngẫu nhiên, đặt env riêng tư rồi deploy. Nếu build hoặc đăng nhập thất bại, lệnh dừng trước khi upload. Sau đó vẫn cần mở URL trên điện thoại và kiểm tra gate, filter, ảnh và noindex. `npm run publish` chưa được chạy end-to-end trong môi trường hiện tại.

Hoặc chạy từng bước:

```sh
npx vercel login
npx vercel link
npx vercel env add ARCHIVE_PASSCODE production
npx vercel env add ARCHIVE_SESSION_SECRET production
npx vercel env add ARCHIVE_ACCESS production
npx vercel --prod
```

Đặt `ARCHIVE_ACCESS=private` (mặc định). Sinh hai giá trị riêng bằng `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`. Giữ chúng trong env của Vercel, không commit. Có thể thay passcode để thu hồi tất cả session cũ. Session hết hạn sau 30 ngày; nút “close the notebook” xóa cookie trên thiết bị hiện tại.

Nếu chủ động muốn bỏ gate và chỉ giữ link unlisted, đặt `ARCHIVE_ACCESS=unlisted`. Khi đó ai có URL cũng đọc được. `noindex` không phải khóa bảo mật. Thiếu secret/passcode trong private mode thì archive luôn đóng.

## Confidential data

Nội dung cá nhân của archive gốc nằm ngoài source code:

```text
.confidential/
  entries/
  photos/
```

Thư mục này bị Git ignore, bị Vercel ignore và được đặt quyền chỉ tài khoản local hiện tại có thể đọc. Có thể đặt `CONFIDENTIAL_DATA_DIR` thành một absolute path khác nếu muốn lưu confidential data hoàn toàn bên ngoài repository checkout. `source/ARCHIVE_SOURCE_PACK.md` vẫn là canonical private source và cũng không được Git/Vercel upload.

`.archive-data/` là storage riêng cho những archive được tạo qua portal; nó cũng không được commit hoặc upload.

Chạy `npm run rotate-secrets` để thay passcode, session secret và mọi editor recovery key. Giá trị mới không được in ra terminal; passcode và recovery links được lưu trong `.confidential/owner-access.txt` với quyền `600`. Editor recovery link dùng URL fragment, đổi thành HttpOnly cookie một lần rồi chuyển về URL editor sạch.

## Riêng tư

Gate xác thực ở server; nội dung và ảnh không được gửi trước khi nhập đúng passcode. Cookie HttpOnly, SameSite Strict, Secure trên production; session được ký HMAC và đổi passcode sẽ vô hiệu hóa cookie cũ. HTML/ảnh không cache. Metadata và response header luôn có noindex/nofollow; robots.txt chặn crawler. Không sitemap.

Đây là gate dùng chung, không phải tài khoản riêng. Người có passcode có thể lưu/chụp/chia sẻ nội dung. Vercel giữ source và nội dung server theo cách vận hành hosting thông thường. Giữ repo private nếu sau này nối Git; không đặt ảnh riêng trong public/. Không có database/CMS phải trả phí.

## Đổi title

Title ở `app/page.js`, `app/unlock/page.js` và `app/layout.js`. Nội dung entry giữ nguyên cách viết của bạn, bao gồm tiếng Việt và chữ hoa nếu có.
