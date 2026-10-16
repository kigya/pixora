/* Pixora feedback. Deploy as a web app: execute as owner, access anyone.
 * Messages go only to the owner's inbox. No images or attachments are accepted.
 * Set the recipient below; never expose SMTP passwords or Google tokens in APK.
 */
var RECIPIENT = 'kirillborichevskiy@gmail.com';
function validateFeedback(input) {
  if (!input || typeof input !== 'object') throw new Error('INVALID');
  var email = String(input.email || '').trim();
  var message = String(input.message || '').trim();
  var rating = Number(input.rating);
  var id = String(input.id || '');
  var version = String(input.version || '');
  var platform = input.platform == null ? 'android' : String(input.platform);
  if (email.length > 254 || (email && !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)) || message.length < 5 || message.length > 4000 || !Number.isInteger(rating) || rating < 0 || rating > 5 || !/^[a-f0-9-]{36}$/.test(id) || !/^\d+\.\d+\.\d+$/.test(version) || ['android','ios'].indexOf(platform) < 0) throw new Error('INVALID');
  return {email:email,message:message,rating:rating,id:id,version:version,platform:platform};
}
function doPost(event) {
  var lock = LockService.getScriptLock();
  var response;
  try {
    if (!event || !event.postData || event.postData.contents.length > 20000) throw new Error('INVALID');
    var data = validateFeedback(JSON.parse(event.postData.contents));
    if (!lock.tryLock(10000)) throw new Error('BUSY');
    var cache = CacheService.getScriptCache();
    if (cache.get('sent:' + data.id)) response = {ok:true,id:data.id};
    else {
      // An omitted reply address is not a shared user identity.
      var hash = data.email ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data.email.toLowerCase()).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('') : '';
      if (hash && cache.get('email:' + hash)) throw new Error('RATE_LIMIT');
      var props = PropertiesService.getScriptProperties();
      var today = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
      var count = props.getProperty('day') === today ? Number(props.getProperty('count') || '0') : 0;
      // Stay below consumer quota; no paid plan or auto-upgrade is used.
      if (count >= 50 || MailApp.getRemainingDailyQuota() < 1) throw new Error('QUOTA');
      var mail = {to:RECIPIENT,subject:'Pixora '+data.version+' — feedback'+(data.rating ? ' ('+data.rating+'/5)' : ''),body:'Reply email: '+(data.email || 'not provided')+'\nRating: '+(data.rating || 'not supplied')+'\nPlatform: '+data.platform+'\nVersion: '+data.version+'\n\n'+data.message};
      if (data.email) mail.replyTo = data.email;
      MailApp.sendEmail(mail);
      props.setProperties({day:today,count:String(count+1)});
      cache.put('sent:'+data.id,'1',21600);
      if (hash) cache.put('email:'+hash,'1',600);
      response={ok:true,id:data.id};
    }
  } catch(error) {
    var allowed=['INVALID','BUSY','RATE_LIMIT','QUOTA'];
    response={ok:false,code:allowed.indexOf(error.message)>=0 ? error.message : 'SEND_FAILED'};
  } finally { if(lock.hasLock())lock.releaseLock(); }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
// Local Node tests execute this same source with controlled Google boundaries.
if(typeof module!=='undefined')module.exports={validateFeedback:validateFeedback,doPost:doPost};
