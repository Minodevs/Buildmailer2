# Bulk Email Sender

Bulk email gönderimi için Node.js uygulaması. Cron job desteği ile zamanlanmış gönderim yapabilirsiniz.

## Özellikler

- ✅ Bulk email gönderimi
- ✅ HTML template desteği (UTF-8)
- ✅ Cron job ile zamanlanmış gönderim
- ✅ Otomatik unsubscribe footer (mesajio.com)
- ✅ Progress takibi
- ✅ Railway deploy desteği

## Kurulum

```bash
npm install
```

## Çalıştırma

```bash
npm start
```

## Environment Variables

```
SMTP_HOST=smtpdm-ap-southeast-1.aliyuncs.com
SMTP_PORT=465
SMTP_USER=noreply@example.com
SMTP_PASS=your_password
PORT=3000
```

## Railway Deploy

1. GitHub'a push et
2. Railway'de yeni proje oluştur
3. GitHub repo'yu bağla
4. Environment variables ekle
5. Deploy!

## Cron Expression Örnekleri

- `0 9 * * *` - Her gün saat 09:00
- `0 */2 * * *` - Her 2 saatte bir
- `*/30 * * * *` - Her 30 dakikada bir
- `0 9 * * 1` - Her Pazartesi 09:00
