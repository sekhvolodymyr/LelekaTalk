export const calendarScopes=['https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
export function nextDay(day){const date=new Date(`${day}T12:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)throw Error('invalid_date');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
export function dayWindow(day){nextDay(day);return {timeMin:new Date(`${day}T00:00:00`).toISOString(),timeMax:new Date(`${nextDay(day)}T00:00:00`).toISOString()};}
export function eventBody({title,date,time='',endDate='',endTime=''}){
  if(typeof title!=='string'||!title.trim()||title.trim().length>200)throw Error('invalid_text');nextDay(date);
  if(!time){const end=endDate?nextDay(endDate):nextDay(date);if(end<=date)throw Error('invalid_date');return {summary:title.trim(),start:{date},end:{date:end}};}
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||(endTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)))throw Error('invalid_time');
  if(endDate)nextDay(endDate);
  const start=new Date(`${date}T${time}:00`),end=endTime?new Date(`${endDate||date}T${endTime}:00`):new Date(start.getTime()+3600000);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw Error('invalid_time');
  const clock=value=>`${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}`;
  if(clock(start)!==time||endTime&&clock(end)!==endTime)throw Error('invalid_time');
  return {summary:title.trim(),start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()}};
}
const stamp=value=>value.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function googleEventLink(plan){const body=eventBody(plan),url=new URL('https://calendar.google.com/calendar/render');url.searchParams.set('action','TEMPLATE');url.searchParams.set('text',body.summary);url.searchParams.set('dates',body.start.date?`${stamp(body.start.date)}/${stamp(body.end.date)}`:`${stamp(body.start.dateTime)}/${stamp(body.end.dateTime)}`);return url.href;}
export function calendarIcs(plans){
  const escape=value=>String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//LelekaTalk//My Space//UK','CALSCALE:GREGORIAN'];
  for(const plan of plans){const body=eventBody(plan);lines.push('BEGIN:VEVENT',`UID:${escape(plan.id)}@lelekatalk`,`DTSTAMP:${stamp(new Date().toISOString())}`,`SUMMARY:${escape(body.summary)}`,body.start.date?`DTSTART;VALUE=DATE:${stamp(body.start.date)}`:`DTSTART:${stamp(body.start.dateTime)}`,body.end.date?`DTEND;VALUE=DATE:${stamp(body.end.date)}`:`DTEND:${stamp(body.end.dateTime)}`,'END:VEVENT');}
  lines.push('END:VCALENDAR');
  // RFC 5545 folds lines at 75 UTF-8 octets without splitting characters.
  return lines.map(line=>{let out='',length=0;for(const char of line){const bytes=new TextEncoder().encode(char).length;if(length+bytes>75){out+='\r\n ';length=1;}out+=char;length+=bytes;}return out;}).join('\r\n')+'\r\n';
}
