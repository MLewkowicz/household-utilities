"""Capital answers for the atlas. Roles and spellings are explicit overrides;
quiz pools exclude entries with no designated capital in this snapshot.
"""
import json,re,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
atlas=json.loads((root/'src/geography-data.json').read_text())
answers={}
for c in atlas:
 text=c['capital']
 if not text or 'no permanent capital' in text.lower() or 'no official capital' in text.lower() or text.startswith('administered'):continue
 text=text.split('; note')[0]
 names=[re.sub(r'\s*\([^)]*\)','',p).strip() for p in text.split(';')]
 # Parenthetical labels are explanations, never aliases.
 answers[c['id']]={'names':names,'aliases':names}
def set(id,names,aliases=(),**extra):answers[id]={'names':names,'aliases':list(dict.fromkeys(names+list(aliases))),**extra}
for id,names,aliases in [
 ('ALB',['Tirana'],['Tirane']),('AZE',['Baku'],['Baki','Baky']),('CYP',['Nicosia'],['Lefkosia','Lefkosa']),('GUM',['Hagåtña'],['Hagatna','Agana']),('KOS',['Pristina'],['Prishtina','Prishtine']),('LAO',['Vientiane'],['Viangchan']),('LBY',['Tripoli'],['Tarabulus']),('MEX',['Mexico City'],['Ciudad de Mexico']),('MDA',['Chișinău'],['Chisinau','Kishinev']),('SRB',['Belgrade'],['Beograd']),('TKM',['Ashgabat'],['Ashkhabad']),('TCA',['Cockburn Town'],['Grand Turk']),('UKR',['Kyiv'],['Kiev']),('UZB',['Tashkent'],['Toshkent']),('VNM',['Hanoi'],['Ha Noi']),('USA',['Washington, D.C.'],['Washington DC','Washington D C','Washington']),('KIR',['South Tarawa'],['Tarawa']),('CIV',['Yamoussoukro'],[]),('BEN',['Porto-Novo'],[]),('CHL',['Santiago'],[]),('VUT',['Port Vila'],['Port-Vila']),('MSR',['Plymouth','Brades'],[]),('SMR',['San Marino'],['City of San Marino'])]:set(id,names,aliases)
set('MSR',['Plymouth','Brades'],['Brades Estate'],note='Plymouth: abandoned capital; Brades: current government seat.',source='https://www.visitmontserrat.com/boat-tours/')
set('MMR',['Nay Pyi Taw'],['Naypyidaw','Nay Pyi Daw'],source='https://myanmar.gov.mm/en/-/nay-pyi-daw')
set('BDI',['Gitega'],source='https://www.mae.gov.bi/geographie/')
set('GNQ',['Ciudad de la Paz'],['Djibloho','Oyala'],source='https://www.guineaecuatorialpress.com/noticias/el_presidente_de_la_republica_proclama_la_ciudad_de_la_paz_como_capital_de_la_republica_de_guinea_ecuatorial_con_la_firma_de_un_decreto_ley')
set('LKA',['Sri Jayawardenepura Kotte','Colombo'],['Sri Jayewardenepura Kotte','Sri Jayawardanapura Kotte','Kotte'],note='Kotte: legislative; Colombo: executive and judicial.',source='https://www.kotte.mc.gov.lk/index.php?Itemid=175&id=25&lang=en&option=com_content&view=article')
set('ZAF',['Pretoria','Cape Town','Bloemfontein'],note='Administrative, legislative and judicial capitals, respectively.',source='https://www.gov.za/about-sa/south-africas-provinces')
set('BOL',['Sucre','La Paz'],note='Sucre: constitutional capital; La Paz: seat of government.')
set('SWZ',['Mbabane','Lobamba'],note='Mbabane: administrative; Lobamba: royal and legislative.')
(root/'src/geography-capitals.json').write_text(json.dumps(answers,ensure_ascii=False,indent=2)+'\n')
print('Capital entries:',len(answers))
