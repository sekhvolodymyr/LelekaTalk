// Bind the requested camera mode to the signed description. Old audio clients
// did not include media; only audio calls may use that legacy envelope.
export function validateCallDescription(value, call, type) {
  const media=call.media??'audio',signedMedia=value.media??'audio';
  const description=value.description;
  if(!['audio','video'].includes(media)||signedMedia!==media||description?.type!==type||typeof description.sdp!=='string'||description.sdp.length>24000)throw Error('invalid_call_description');
  const hasVideo=/(?:^|\r?\n)m=video\s/.test(description.sdp);
  if(hasVideo!==(media==='video'))throw Error('invalid_call_description');
  return description;
}
