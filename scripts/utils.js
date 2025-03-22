export const sleepPromise = (ms = 0) => new Promise((rs) => {
  setTimeout(rs, ms);
});

export const formatTime = (
  template = 'yyyy/MM/dd HH:mm:ss.fff',
  time = new Date(),
) => [
  { reg: /y+/g, value: time.getFullYear() },
  { reg: /M+/g, value: time.getMonth() + 1 },
  { reg: /d+/g, value: time.getDate() },
  { reg: /H+/g, value: time.getHours() },
  { reg: /h+/g, value: time.getHours() % 12 },
  { reg: /m+/g, value: time.getMinutes() },
  { reg: /s+/g, value: time.getSeconds() },
  { reg: /f+/g, value: time.getMilliseconds() },
].reduce((string, { reg, value }) => {
  if (!reg.test(string)) return string;
  return string.replace(reg, (m) => {
    const len = m.length;
    const pad = '0'.repeat(len);
    return `${pad}${value}`.slice(-len);
  });
}, template);
