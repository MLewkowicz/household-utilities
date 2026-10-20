import { $, money } from './ui';
import { calculateCents } from './calculator';

type Options={title:string;initial:string;totalCents?:number;allowZero?:boolean;canSplitRest?:boolean;onUse:(cents:number,splitRest:boolean)=>void};
let current:Options|null=null,mode:'amount'|'share'='amount',result:number|null=null;
const expression=()=>$<HTMLInputElement>('#calculator-expression');

export function initCalculator() {
 document.body.insertAdjacentHTML('beforeend',`<dialog id="calculator-dialog" class="calculator-dialog" aria-labelledby="calculator-title"><form id="calculator-form">
  <div class="dialog-top"><div class="eyebrow">A LITTLE LESS MATH</div><button type="button" id="calculator-close" class="icon-button" aria-label="Close calculator">×</button></div>
  <h2 id="calculator-title" tabindex="-1" autofocus>Calculator</h2>
  <div id="calculator-modes" class="segmented" role="group" aria-label="Calculation type"><button type="button" data-calc-mode="amount">Dollar amount</button><button type="button" data-calc-mode="share">Fraction / %</button></div>
  <label class="sr-only" for="calculator-expression">Calculation</label><input id="calculator-expression" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="120" aria-describedby="calculator-help">
  <div class="calculator-result"><span>Result</span><output id="calculator-result" aria-live="polite">—</output></div><p id="calculator-help" class="section-copy"></p>
  <div id="calculator-fractions" class="calculator-fractions">${['1/2','1/3','1/4','25%'].map(value=>`<button type="button" data-calc-expression="${value}">${value}</button>`).join('')}</div>
  <div class="calculator-keypad">${[['C','Clear calculation'],['(','Open parenthesis'],[')','Close parenthesis'],['⌫','Delete last character'],['7','7'],['8','8'],['9','9'],['÷','Divide'],['4','4'],['5','5'],['6','6'],['×','Multiply'],['1','1'],['2','2'],['3','3'],['−','Subtract'],['0','0'],['.','Decimal point'],['%','Percent'],['+','Add']].map(([value,label])=>`<button type="button" data-calc-key="${value}" aria-label="${label}">${value}</button>`).join('')}</div>
  <label id="calculator-rest-label" class="inline-check"><input id="calculator-rest" type="checkbox"> Split the rest equally among the others</label>
  <p id="calculator-error" class="form-error" role="status" hidden></p><div class="dialog-actions"><button type="button" id="calculator-cancel" class="button secondary">Cancel</button><button type="submit" id="calculator-use" class="button primary" disabled>Use result</button></div>
 </form></dialog>`);
 expression().addEventListener('input',update);
 $('#calculator-modes').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-calc-mode]');if(!button)return;
  mode=button.dataset.calcMode as 'amount'|'share';expression().value='';update();
 });
 $('#calculator-fractions').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-calc-expression]');if(!button)return;
  expression().value=button.dataset.calcExpression!;update();
 });
 $('.calculator-keypad').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-calc-key]');if(!button)return;
  const field=expression(),key=button.dataset.calcKey!,start=field.selectionStart??field.value.length,end=field.selectionEnd??start;
  if(key==='C')field.value='';
  else if(key==='⌫')field.setRangeText('',start===end?Math.max(0,start-1):start,end,'end');
  else if(field.value.length-(end-start)+key.length<=120)field.setRangeText(key,start,end,'end');
  update();
 });
 for(const id of ['calculator-close','calculator-cancel'])$('#'+id).addEventListener('click',()=>$<HTMLDialogElement>('#calculator-dialog').close());
 $('#calculator-form').addEventListener('submit',event=>{
  event.preventDefault();if(!current||result===null)return;
  const splitRest=mode==='share'&&!!current.canSplitRest&&$<HTMLInputElement>('#calculator-rest').checked;
  $<HTMLDialogElement>('#calculator-dialog').close();current.onUse(result,splitRest);
 });
}
function update() {
 if(!current)return;
 $('#calculator-modes').hidden=current.totalCents===undefined;
 document.querySelectorAll<HTMLElement>('[data-calc-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.calcMode===mode)));
 $('#calculator-fractions').hidden=mode!=='share';
 $('#calculator-rest-label').hidden=mode!=='share'||!current.canSplitRest;
 expression().placeholder=mode==='share'?'1/3 or 25%':'12.50 + 8.75';
 $('#calculator-help').textContent=mode==='share'?`Fraction or percentage of the ${money(current.totalCents!)} purchase. Rounded to the nearest cent.`:'Add items or divide totals. For percentages, use ×, for example 60 × 25%.';
 result=null;let error='';
 try{result=calculateCents(expression().value,mode==='share'?current.totalCents:undefined);if(!current.allowZero&&result===0)throw new Error('Use an amount greater than zero.');}
 catch(e){result=null;if(expression().value.trim())error=e instanceof Error?e.message:'Check the calculation.';}
 $('#calculator-result').textContent=result===null?'—':money(result);
 $('#calculator-error').textContent=error;$('#calculator-error').hidden=!error;
 $('#calculator-use').textContent=result===null?'Use result':`Use ${money(result)}`;
 $<HTMLButtonElement>('#calculator-use').disabled=result===null;
}
export function openCalculator(options:Options) {
 current=options;mode=options.totalCents===undefined?'amount':'share';
 $('#calculator-title').textContent=options.title;
 expression().value=mode==='share'?'':options.initial;
 $<HTMLInputElement>('#calculator-rest').checked=false;
 update();$<HTMLDialogElement>('#calculator-dialog').showModal();$('#calculator-title').focus({preventScroll:true});
}
