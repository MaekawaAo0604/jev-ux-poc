// Conservative no-swap cutoff: 06:00 JST, enforced even if the feed goes silent.
export function nextFxBoundary(now){return (Math.floor((now+3*3600000)/86400000)+1)*86400000-3*3600000;}
