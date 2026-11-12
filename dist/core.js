/* Shared rules: browser UI and node tests use the same functions. */
(function (root) {
  'use strict';
  const periods = {morning:[9,12],day:[12,17],evening:[17,21]};
  const activeStatuses = ['pending','proposal','confirmed'];
  function normalize(value) { return String(value ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim(); }
  function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function addDays(value, count) { const d = new Date(value+'T12:00:00'); d.setDate(d.getDate()+count); return localDate(d); }
  function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false; const d=new Date(value+'T12:00:00'); return !Number.isNaN(+d) && localDate(d)===value; }
  function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value||''); }
  function minutes(value) { return validTime(value) ? Number(value.slice(0,2))*60 + Number(value.slice(3)) : NaN; }
  function scheduleMatch(master, date, period, time, duration=0) {
    if (!date || !validDate(date)) return true;
    const schedule=master.schedule||{days:[1,2,3,4,5,6],start:'09:00',end:'21:00'};
    if(!schedule.days.includes(new Date(date+'T12:00:00').getDay())) return false;
    const start=minutes(schedule.start),end=minutes(schedule.end);
    if(time) return validTime(time) && minutes(time)>=start && minutes(time)+duration<=end;
    if(periods[period]) { const [a,b]=periods[period].map(x=>x*60); return Math.max(start,a)+duration<=Math.min(end,b); }
    return true;
  }
  function filterMasters(masters, query={}) {
    const term=normalize(query.search), budget=Number(query.budget)||0;
    const result=masters.filter(m=>m.active!==false && (!query.ids || query.ids.includes(m.id))).map(m=>{
      let services=(m.services||[]).filter(s=>s.active!==false);
      if(query.cat) services=services.filter(s=>s.cat===query.cat || query.cat==='browlash'&&['brows','lashes'].includes(s.cat) || query.cat==='allhair'&&['hair','cut'].includes(s.cat));
      if(term && !normalize(m.name+' '+m.role).includes(term)) services=services.filter(s=>normalize(s.name+' '+s.cat+' '+(s.tags||'')).includes(term));
      if(budget>0) services=services.filter(s=>Number(s.price)<=budget);
      if(query.area&&m.area!==query.area) return null;
      if(query.date) services=services.filter(s=>scheduleMatch(m,query.date,query.period,query.time,Number(s.duration)||0));
      return services.length?{...m,matchedServices:services}:null;
    }).filter(Boolean);
    if(query.sort==='price') result.sort((a,b)=>Math.min(...a.matchedServices.map(s=>s.price))-Math.min(...b.matchedServices.map(s=>s.price)));
    if(query.sort==='rating') result.sort((a,b)=>Number(String(b.rating).replace(',','.'))-Number(String(a.rating).replace(',','.')));
    return result;
  }
  function validateWish(wish, now=new Date()) {
    if(!validDate(wish.date)) return 'Выберите желаемую дату';
    if(wish.date<localDate(now)) return 'Выберите сегодняшнюю или будущую дату';
    if(wish.time) {
      if(!validTime(wish.time)) return 'Укажите время в формате 14:30';
      if(new Date(wish.date+'T'+wish.time)<=now) return 'Это время уже прошло. Выберите другое';
    } else {
      if(!periods[wish.period]) return 'Выберите удобное время';
      if(wish.date===localDate(now) && periods[wish.period][1]*60<=now.getHours()*60+now.getMinutes()) return 'Этот интервал уже закончился. Выберите другой';
    }
    return '';
  }
  function validatePhone(value) { const text=String(value||''); const digits=text.replace(/\D/g,''); return /^[+\d\s()-]+$/.test(text) && digits.length>=10&&digits.length<=15; }
  function conflicts(bookings, masterId, date, time, duration, excludeId) {
    const a=minutes(time),b=a+Number(duration);
    return bookings.some(x=>x.id!==excludeId && x.master===masterId && ['confirmed','proposal'].includes(x.status) && (x.proposal?.date||x.date)===date && (()=>{const c=minutes(x.proposal?.time||x.time);return Number.isFinite(c)&&a<c+Number(x.duration||60)&&b>c;})());
  }
  function offer(booking, values, master, bookings, now=new Date()) {
    if(!['pending','proposal'].includes(booking.status)) throw Error('Эта заявка уже обработана');
    const error=validateWish(values,now);if(error)throw Error(error);
    if(!values.time)throw Error('Мастеру нужно предложить точное время');
    const price=Number(values.price); if(!Number.isFinite(price)||price<0||price>1000000)throw Error('Укажите корректную стоимость');
    if(!scheduleMatch(master,values.date,'',values.time,booking.duration))throw Error('Визит выходит за рабочие часы мастера');
    if(conflicts(bookings,master.id,values.date,values.time,booking.duration,booking.id))throw Error('На это время уже есть запись или предложение');
    return {...booking,status:'proposal',proposal:{date:values.date,time:values.time,price},updatedAt:now.toISOString()};
  }
  function accept(booking, master, bookings, now=new Date()) {
    if(booking.status!=='proposal'||!booking.proposal)throw Error('Предложение уже недоступно');
    const error=validateWish(booking.proposal,now);if(error)throw Error(error);
    if(!scheduleMatch(master,booking.proposal.date,'',booking.proposal.time,booking.duration))throw Error('Рабочие часы изменились. Запросите другое время');
    if(conflicts(bookings,master.id,booking.proposal.date,booking.proposal.time,booking.duration,booking.id))throw Error('На это время уже появилась запись');
    return {...booking,...booking.proposal,status:'confirmed',proposal:null,updatedAt:now.toISOString()};
  }
  const api={periods,activeStatuses,normalize,localDate,addDays,validDate,validTime,minutes,scheduleMatch,filterMasters,validateWish,validatePhone,conflicts,offer,accept};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FormaCore=api;
})(typeof window!=='undefined'?window:globalThis);
