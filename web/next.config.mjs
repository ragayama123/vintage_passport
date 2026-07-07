/** @type {import('next').NextConfig} */
const nextConfig = {
  // 注: /api/* (Route Handler) にはデフォルトのボディ上限が無いため特別な設定は不要。
  // 画像はクライアント側で長辺1568pxのJPEGにリサイズしてから送信する(app/page.tsx)。
};

export default nextConfig;
