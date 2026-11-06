// オンライン対戦の通信設定。
// 空のままなら PeerJS（WebRTC）で直接つなぎます（設定不要）。
// 学内Wi-Fiなどでつながらない場合は Supabase プロジェクトの URL と anon key を入れると、
// Supabase Realtime 経由の通信に切り替わります。
const NET_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
};
