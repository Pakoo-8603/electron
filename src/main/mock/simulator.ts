import express from 'express';

const app = express();
app.use(express.json());

app.get('/ISAPI/System/deviceInfo', (_req, res) => {
  res.type('application/xml').send('<DeviceInfo><deviceName>Mock Hikvision</deviceName></DeviceInfo>');
});

app.get('/ISAPI/Event/notification/alertStream', (_req, res) => {
  const boundary = 'myboundary';
  res.writeHead(200, {
    'Content-Type': `multipart/mixed; boundary=${boundary}`,
    Connection: 'keep-alive'
  });

  setInterval(() => {
    const payload = `<EventNotificationAlert><major>accessControl</major><minor>accessGranted</minor><dateTime>${new Date().toISOString()}</dateTime><employeeNoString>1001</employeeNoString><name>John Doe</name></EventNotificationAlert>`;
    res.write(`--${boundary}\r\nContent-Type: application/xml\r\n\r\n${payload}\r\n`);
  }, 3000);
});

app.post('/gateway/events/batch', (_req, res) => {
  res.json({ ok: true });
});

app.listen(9090, () => console.log('Mock Hikvision/Cloud listening on 9090'));
