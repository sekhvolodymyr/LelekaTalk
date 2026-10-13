const categories = [
  ['😀','Емоції','Faces','😀:усмішка smile|😃:радість happy|😄:щастя happy|😁:посмішка grin|😆:сміх laugh|😅:полегшення sweat|😂:сміх tears laugh|🤣:сміх laugh|😊:усмішка smile|🙂:усмішка smile|😉:підморгування wink|😍:закоханий love|🥰:любов love|😘:поцілунок kiss|😎:крутий cool|🤩:захват star|🥳:свято party|🤔:думаю thinking|🤗:обійми hug|🫡:вітаю salute|🤭:сміх giggle|😴:сон sleep|😢:сум sad|😭:плач cry|😤:злість angry|😡:злість angry|😱:страх scream|😮:здивування surprise|🙃:іронія upside|🥺:прошу please|😇:янгол angel|🤯:шок mind'],
  ['👋','Жести','Gestures','👋:привіт hello wave|🤚:рука hand|✋:стоп stop|👌:добре okay|🤌:жест pinch|✌️:мир peace|🤞:удача luck|🤟:любов love|🤘:рок rock|👍:подобається like yes|👎:ні dislike no|👏:оплески clap|🙌:ура hooray|👐:руки hands|🤝:згода handshake|🙏:дякую thanks please|💪:сила strong|✍️:писати write|🫶:любов love heart|🫂:обійми hug'],
  ['❤️','Серця','Hearts','❤️:любов love heart|🧡:серце orange heart|💛:серце yellow heart|💚:серце green heart|💙:серце blue heart|💜:серце purple heart|🖤:серце black heart|🤍:серце white heart|🤎:серце brown heart|🩷:серце pink heart|💔:розбите broken heart|💕:серця love hearts|💞:серця hearts|💖:сяйво heart|💘:кохання cupid heart|💝:подарунок heart gift|🔥:вогонь fire|✨:блиск sparkles|💯:сто hundred|✅:готово done yes'],
  ['🌿','Природа','Nature','🐱:кіт cat|🐶:пес dog|🦊:лисиця fox|🐻:ведмідь bear|🐼:панда panda|🐰:кролик rabbit|🐦:птах bird|🕊️:голуб dove peace|🦋:метелик butterfly|🐝:бджола bee|🌿:зелень leaf|🌻:соняшник sunflower|🌸:квітка blossom flower|🌹:троянда rose|🌳:дерево tree|☀️:сонце sun|🌙:місяць moon|⭐:зірка star|🌈:веселка rainbow|❄️:сніг snow'],
  ['🎨','Життя','Life','🎨:творчість art|🎵:музика music|🎧:навушники headphones|🎬:кіно movie|📷:фото camera|📚:книги books|💡:ідея idea|💻:комп’ютер computer|📅:календар calendar|📝:нотатка note|☕:кава coffee|🍵:чай tea|🍕:піца pizza|🍰:торт cake|🎂:день народження birthday|🎁:подарунок gift|🎉:свято celebration|🚀:ракета rocket|⚽:футбол football|🇺🇦:Україна Ukraine'],
].map(([icon,uk,en,items])=>({icon,uk,en,items:items.split('|').map(item=>item.split(':'))}));
document.addEventListener('click', event => { for(const picker of document.querySelectorAll('.emoji-picker[open]')) if(!picker.contains(event.target)) picker.open=false; });
export function bindEmojiPicker(form, language) {
  const field=form.querySelector('textarea'),uk=language==='uk';
  const picker=document.createElement('details');picker.className='emoji-picker';
  const summary=document.createElement('summary');summary.textContent='☺';summary.setAttribute('aria-label',uk?'Обрати смайл':'Choose emoji');picker.append(summary);
  const panel=document.createElement('div');panel.className='emoji-panel';panel.setAttribute('role','group');panel.setAttribute('aria-label',uk?'Набір смайлів':'Emoji picker');picker.append(panel);
  const search=document.createElement('input');search.type='search';search.placeholder=uk?'Пошук смайлів…':'Search emoji…';search.setAttribute('aria-label',search.placeholder);search.autocomplete='off';panel.append(search);
  const tabs=document.createElement('div');tabs.className='emoji-tabs';panel.append(tabs);
  const grid=document.createElement('div');grid.className='emoji-grid';grid.setAttribute('aria-live','polite');panel.append(grid);
  let category=0;
  function render() {
    const query=search.value.trim().toLocaleLowerCase();grid.replaceChildren();
    for(const [index,button] of [...tabs.children].entries())button.setAttribute('aria-pressed',String(index===category && !query));
    const items=query?categories.flatMap(c=>c.items).filter(([emoji,tags])=>(emoji+' '+tags).includes(query)):categories[category].items;
    if(!items.length){const empty=document.createElement('p');empty.textContent=uk?'Нічого не знайдено':'No emoji found';grid.append(empty);}
    for(const [emoji,tags] of items){const button=document.createElement('button');button.type='button';button.className='emoji-option';button.textContent=emoji;button.title=tags;button.setAttribute('aria-label',emoji+' '+tags);button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>{if(field.disabled || field.value.length-(field.selectionEnd-field.selectionStart)+emoji.length>field.maxLength)return;field.setRangeText(emoji,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));picker.open=false;field.focus();});grid.append(button);}
  }
  for(const [index,c] of categories.entries()){const button=document.createElement('button');button.type='button';button.textContent=c.icon;button.title=uk?c.uk:c.en;button.setAttribute('aria-label',button.title);button.addEventListener('click',()=>{category=index;search.value='';render();});tabs.append(button);}
  search.addEventListener('input',render);
  picker.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();picker.open=false;summary.focus();}});
  summary.addEventListener('click',event=>{if(field.disabled){event.preventDefault();return;}for(const other of document.querySelectorAll('.emoji-picker[open]'))if(other!==picker)other.open=false;});
  form.prepend(picker);render();
}
