export type HoldoutTask='switch'|'revisit'|'direct';
export type HoldoutVariant='alpha'|'beta';
export type HoldoutFixture={task:HoldoutTask;variant:HoldoutVariant};

const assignments:Record<string,HoldoutFixture>={s1a:{task:'switch',variant:'alpha'},s1b:{task:'switch',variant:'beta'},r1a:{task:'revisit',variant:'alpha'},r1b:{task:'revisit',variant:'beta'},d1a:{task:'direct',variant:'alpha'},d1b:{task:'direct',variant:'beta'}};
function fixtureToken(fixture:HoldoutFixture):string{
 const token=Object.keys(assignments).find(key=>assignments[key].task===fixture.task&&assignments[key].variant===fixture.variant);
 if(!token)throw new Error('Unsupported holdout fixture');return token;
}
export function holdoutQuery(fixture:HoldoutFixture):string{return '?holdout='+fixtureToken(fixture);}
/** Local opt-in only. Ambiguous fixture selectors fail closed. */
export function parseHoldoutFixture(search:string):HoldoutFixture|undefined{
 const params=new URLSearchParams(search),tokens=params.getAll('holdout');
 if(tokens.length!==1||params.has('semanticFixture')||params.has('betaUI')||params.has('transfer'))return undefined;
 const fixture=Object.hasOwn(assignments,tokens[0])?assignments[tokens[0]]:undefined;return fixture?{...fixture}:undefined;
}
export function holdoutDefinition(fixture:HoldoutFixture):{version:1;task:HoldoutTask;variant:HoldoutVariant;goal:string;title:string;objectiveText:string}{
 fixtureToken(fixture);
 const definitions={
  switch:{goal:'定期便のお届け曜日を、現在の水曜日から土曜日に変更してください。',title:'定期便マイページ',objectiveText:'定期便のお届け曜日を土曜日に変更しました'},
  revisit:{goal:'アルバム「旅の記録」の共有リンクを無効にしてください。',title:'アルバム管理',objectiveText:'共有リンクを無効にしました'},
  direct:{goal:'次回のスタジオ予約を2026年11月14日に変更してください。',title:'予約マイページ',objectiveText:'次回の予約を2026年11月14日に変更しました'},
 };
 return {version:1,...fixture,...definitions[fixture.task]};
}
/** Certification only: never imported or consulted by the rendered UI. */
export function holdoutReferencePath(fixture:HoldoutFixture):string[]{
 fixtureToken(fixture);
 return fixture.task==='switch'?['alternative','apply']:fixture.task==='revisit'?['primary','home','account','verify','home','primary','apply']:['primary','apply'];
}
