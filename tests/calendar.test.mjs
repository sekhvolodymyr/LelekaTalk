import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eventBody,dayWindow,googleEventLink,calendarIcs} from '../phase-one/public/calendar-utils.js';

test('calendar boundaries follow local DST and all-day ends are exclusive',t=>{
  const previous=process.env.TZ;process.env.TZ='Europe/Rome';t.after(()=>{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;});
  for(const[day,hours]of [['2026-03-29',23],['2026-10-25',25]]){const range=dayWindow(day);assert.equal((Date.parse(range.timeMax)-Date.parse(range.timeMin))/3600000,hours);}
  assert.throws(()=>eventBody({title:'DST gap',date:'2026-03-29',time:'02:30'}));
  assert.deepEqual(eventBody({title:'Trip',date:'2026-10-19',endDate:'2026-10-21'}),{summary:'Trip',start:{date:'2026-10-19'},end:{date:'2026-10-22'}});
  const timed=eventBody({title:'Meeting',date:'2026-10-19',time:'23:30'});assert.equal(Date.parse(timed.end.dateTime)-Date.parse(timed.start.dateTime),3600000);
});
test('calendar validates input and Google links encode titles without injecting parameters',()=>{
  for(const value of [{title:'',date:'2026-10-19'},{title:'x',date:'2026-02-30'},{title:'x',date:'2026-10-19',time:'24:00'},{title:'x',date:'2026-10-19',time:'10:00',endTime:'09:00'},{title:'x',date:'2026-10-19',endDate:'2026-10-17'}])assert.throws(()=>eventBody(value));
  const url=new URL(googleEventLink({title:'Private & dates=evil 💛',date:'2026-10-19'}));assert.equal(url.origin,'https://calendar.google.com');assert.equal(url.searchParams.get('text'),'Private & dates=evil 💛');assert.equal(url.searchParams.get('dates'),'20261019/20261020');
});
test('ICS escapes content, folds UTF-8 at 75 octets, and preserves timed/all-day events',()=>{
  const title='Назва, з; переносом\nі емодзі 💛'.repeat(5),result=calendarIcs([{id:'one',title,date:'2026-10-19'},{id:'two',title:'Timed',date:'2026-10-19',time:'09:00'}]);
  assert.ok(result.startsWith('BEGIN:VCALENDAR\r\n'));assert.ok(result.endsWith('END:VCALENDAR\r\n'));for(const line of result.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
  const unfolded=result.replace(/\r\n /g,'');assert.ok(unfolded.includes('Назва\\, з\\; переносом\\nі емодзі 💛'));assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261019'));assert.ok(unfolded.includes('DTEND;VALUE=DATE:20261020'));assert.equal(unfolded.match(/BEGIN:VEVENT/g).length,2);
});
