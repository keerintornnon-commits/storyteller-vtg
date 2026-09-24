# STORYTELLER.VTG · หลังร้าน

ระบบหลังร้านสำหรับร้านเสื้อวินเทจ STORYTELLER.VTG ใช้บันทึกทุน วันที่ซื้อ ราคาขาย สต็อก รูปเสื้อ รายละเอียดเสื้อ (Size / Fit / Tag / Style / CONDITION / ตำหนิ) ป้ายกำกับรายตัว และมี Dashboard กำไร/ขาดทุน

- หน้าเว็บ: HTML + CSS + JavaScript ล้วน ไม่ต้อง build โฮสต์ฟรีบน **GitHub Pages**
- ฐานข้อมูล + Login + ที่เก็บรูป: **Supabase** (แพ็กเกจฟรีใช้ได้)
- เข้าได้เฉพาะทีมร้านที่เจ้าของเพิ่มให้ ไม่มีปุ่มสมัครสมาชิก

```
storyteller-vtg/
├── index.html          หน้าเว็บ (Login + หลังร้าน)
├── css/style.css       ธีมวินเทจจากโลโก้ร้าน
├── js/config.js        ← ใส่ค่าเชื่อม Supabase ตรงนี้
├── js/app.js           ระบบทั้งหมด
├── assets/             โลโก้ + favicon
└── supabase/schema.sql โครงสร้างฐานข้อมูล + สิทธิ์
```

---

## ขั้นที่ 1 · สร้างโปรเจกต์ Supabase

1. สมัคร/เข้าสู่ระบบที่ https://supabase.com แล้วกด **New project**
   - ตั้งชื่อ เช่น `storyteller-vtg`, ตั้งรหัสผ่านฐานข้อมูล (เก็บไว้), Region เลือก **Southeast Asia (Singapore)**
2. รอโปรเจกต์สร้างเสร็จ (~2 นาที)

## ขั้นที่ 2 · สร้างตารางและสิทธิ์

1. เปิดไฟล์ `supabase/schema.sql` แก้อีเมลในส่วนท้ายไฟล์ (ข้อ 4) ให้เป็นอีเมลเจ้าของร้านและทีม
2. ใน Supabase ไปที่ **SQL Editor › New query** วางเนื้อหาทั้งไฟล์ แล้วกด **Run**
   - จะได้ตาราง `shirts`, ตาราง `team_members`, ที่เก็บรูป `shirt-photos` (แบบส่วนตัว) และสิทธิ์ Row Level Security ครบ

## ขั้นที่ 3 · ปิดการสมัครเอง + สร้างบัญชีทีม

1. **Authentication › Sign In / Providers** (หรือ Settings) → ปิด **Allow new users to sign up**
2. **Authentication › Users › Add user › Create new user**
   - ใส่อีเมล + รหัสผ่าน และติ๊ก **Auto Confirm User**
   - อีเมลต้องตรงกับที่ใส่ไว้ใน `team_members`
3. จะเพิ่มทีมคนใหม่ภายหลัง: สร้าง user ตามข้อ 2 แล้วรันใน SQL Editor
   ```sql
   insert into public.team_members (email, name) values ('friend@email.com', 'ชื่อ');
   ```
   ถอดสิทธิ์: `delete from public.team_members where email = 'friend@email.com';`

> ป้องกัน 2 ชั้น: ต่อให้มีคนสมัครบัญชีได้ ถ้าอีเมลไม่อยู่ใน `team_members` ก็เปิดข้อมูลหรือรูปไม่ได้

## ขั้นที่ 4 · ใส่ค่าเชื่อมต่อในเว็บ

ไปที่ **Project Settings › API** (หรือ **Connect**) คัดลอก

- **Project URL** → `SUPABASE_URL`
- **anon public** key → `SUPABASE_ANON_KEY`

แล้วแก้ไฟล์ `js/config.js`

```js
window.STORYTELLER_CONFIG = {
  SUPABASE_URL: "https://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  PHOTO_BUCKET: "shirt-photos"
};
```

> anon key เปิดเผยในเว็บได้ตามปกติ (ข้อมูลถูกล็อกด้วย RLS) แต่ **ห้าม** ใส่ `service_role` key เด็ดขาด

## ขั้นที่ 5 · อัปโหลดขึ้น GitHub + เปิด GitHub Pages

**แบบไม่ใช้คำสั่ง (ง่ายสุด)**
1. ที่ https://github.com กด **New repository** ตั้งชื่อ เช่น `storyteller-vtg` เลือก **Public** (GitHub Pages ฟรีต้องเป็น Public; ข้อมูลร้านไม่ได้อยู่ในโค้ด จึงปลอดภัย)
2. กด **uploading an existing file** แล้วลากไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้นไป (รวมโฟลเดอร์ `css`, `js`, `assets`, `supabase` และไฟล์ `.nojekyll`) → **Commit changes**
3. ไปที่ **Settings › Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → **Save**
4. รอ 1–2 นาที จะได้ลิงก์ `https://<ชื่อผู้ใช้>.github.io/storyteller-vtg/`

**แบบใช้ git**
```bash
cd storyteller-vtg
git init
git add .
git commit -m "STORYTELLER.VTG back office"
git branch -M main
git remote add origin https://github.com/<ชื่อผู้ใช้>/storyteller-vtg.git
git push -u origin main
```
แล้วเปิด GitHub Pages ตามข้อ 3 ด้านบน

## ขั้นที่ 6 · ตั้งค่าลิงก์ลืมรหัสผ่าน

Supabase › **Authentication › URL Configuration**
- **Site URL**: `https://<ชื่อผู้ใช้>.github.io/storyteller-vtg/`
- **Redirect URLs**: เพิ่มลิงก์เดียวกัน

เสร็จแล้ว เปิดลิงก์เว็บ → Login ด้วยบัญชีที่สร้างในขั้นที่ 3 → เริ่มลงเสื้อได้เลย

---

## การใช้งาน

| หน้า | ทำอะไรได้ |
|---|---|
| ภาพรวม | กำไร/ขาดทุนสุทธิ, ยอดขาย, มาร์จิ้น, ทุนจมในสต็อก, กราฟกำไรรายเดือน, กำไรตามป้าย, ขายล่าสุด, ตัวที่ค้างนาน — กดป้ายด้านบนเพื่อดูเฉพาะกลุ่ม |
| สต็อก / ขายแล้ว / ทั้งหมด | การ์ดเสื้อพร้อมรูป ค้นหา เรียงลำดับ กรองตามป้าย |
| กดที่เสื้อ | ดูรูปทั้งหมด, Details แบบป้ายห้อย, **คัดลอกรายละเอียดไปโพสต์**, บันทึกการขาย, แก้ไข, ลบ |
| + เพิ่มเสื้อ | อัปรูปหลายรูป (ย่อให้อัตโนมัติ), ป้ายกำกับรายตัว, Details, ทุน/ราคา |

- กำไร = ราคาขายได้ − (ทุน + ค่าซัก/ส่ง/อื่นๆ)
- เปิดหลายเครื่องพร้อมกันได้ ข้อมูลอัปเดตให้ทุกเครื่องทันที (Realtime)
- รูปเก็บแบบส่วนตัว เปิดได้เฉพาะคนที่ Login และอยู่ในทีม

## แก้ปัญหาที่พบบ่อย

- **ขึ้นว่า "ยังไม่ได้ตั้งค่า js/config.js"** → ยังไม่ได้ใส่ URL/Key ในขั้นที่ 4
- **Login ได้แต่ขึ้นว่า "ยังไม่ได้รับสิทธิ์"** → อีเมลนั้นยังไม่อยู่ใน `team_members`
- **"อีเมลหรือรหัสผ่านไม่ถูกต้อง"** → เช็กว่าสร้าง user แล้วและติ๊ก Auto Confirm
- **อัปรูปไม่ได้** → เช็กว่ารัน `schema.sql` ครบ (มี bucket `shirt-photos`) และรูปไม่เกิน 10MB
- **แก้ไฟล์แล้วเว็บยังไม่เปลี่ยน** → GitHub Pages ใช้เวลา 1–2 นาที ลองรีเฟรชแบบล้างแคช
