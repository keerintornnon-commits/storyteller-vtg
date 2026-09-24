// ตั้งค่าการเชื่อมต่อ Supabase
// หาได้ที่ Supabase Dashboard › Project Settings › API
//   - Project URL        → SUPABASE_URL
//   - anon public key    → SUPABASE_ANON_KEY
// anon key ใส่ในเว็บได้ปลอดภัย เพราะข้อมูลถูกล็อกด้วย Row Level Security
// ห้ามใส่ service_role key ในไฟล์นี้เด็ดขาด
window.STORYTELLER_CONFIG = {
  SUPABASE_URL: "https://wdhgpogtkdnzdbienpcx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Qlp1EHg01efFIMxrhCCLqg_oTrOcgnD",
  PHOTO_BUCKET: "shirt-photos"
};
