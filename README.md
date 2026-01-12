# Kizuna Transfer

**「シンプルで、安全なP2Pファイル転送を、すべての人に。」**

Kizuna Transfer は、会員登録不要・完全無料で利用できる P2P (Peer-to-Peer) ファイル転送サービスです。WebRTC技術を活用し、デバイス間で直接データをやり取りすることで、究極のプライバシーと高速転送を実現します。

## ⚠️ 重要：利用・公開に関する規約

このサービスはOSSですが、**クローンサイトの公開を推奨するものではありません。**
開発者の許可を得ずに、このリポジトリのプログラムをそのまま、もしくはわずかだけを改変し、それを利用して Web アプリケーションを公開することを禁じます。

## 主要機能

### ⚡ P2P 直接転送
*   中央サーバーにファイルは一切保存されません。
*   送信者と受信者のブラウザを直接結ぶため、ファイルサイズは無制限（ギガバイト級も対応可能）です。
*   End-to-End 暗号化により、通信のプライバシーが完全に保護されます。

### 📩 レジューム（中断・再開）機能
*   PCの再起動や通信の中断が発生しても、FileSystem API と IndexedDB を活用して「続きから」転送を再開できます。
*   大容量ファイルの転送も、途切れるストレスなく完遂できます。

### 🛡️ 安心のセキュリティ機能
*   **パスワード保護**: 転送開始前に合言葉を設定できます。
*   **接続ロック**: 通信が確立した後、新しい第三者の参加を遮断できます。
*   **5〜6桁のキー**: ランダムなキーで安全な部屋を作成。

## 技術スタック
*   **Frontend**: Next.js 15+ (App Router), TypeScript, Tailwind CSS
*   **P2P Engine**: PeerJS (WebRTC)
*   **Storage**: IndexedDB, FileSystem Access API
*   **Icons/Graphics**: Lucide React, Twemoji

## 開発・貢献について

バグ報告や機能提案は GitHub Issues にて受け付けています。

---
© 2026 Kizuna Project. Graphics powered by [Twemoji](https://twemoji.twitter.com/).
