"""Select historical episodes with context, excluding current officeholders and status reports.
The input is the pinned public-domain Factbook background. Editorial exceptions have
sources in docs/geography-data.md; keep facts reproducible outside the browser.
"""
import re

# These concise rewrites address backgrounds that otherwise foreground modern politics.
HISTORY = {
 'POL': [
  'Between 1772 and 1795, Russia, Prussia and Austria divided Poland among themselves. Poland disappeared as an independent state until it regained independence in 1918.',
  'Solidarity began as an independent trade union in 1980 and grew into a political force with more than ten million members, challenging communist rule.'
 ],
 'AUS': [
  'Aboriginal peoples had lived in Australia for tens of thousands of years before Europeans arrived. Dutch captain Willem Janszoon mapped part of Cape York in 1606, making the first documented European landing on the continent.'
 ],
 'DNK': [
  'Denmark was a center of the Viking world before becoming a major northern European power. Seafaring connected it with communities far beyond Scandinavia.'
 ],
 'JEY': [
  'Jersey and the other Channel Islands were part of the medieval Duchy of Normandy, whose rulers held lands on both sides of the English Channel.',
  'German forces occupied Jersey during World War II. The Channel Islands were the only part of the British Isles occupied by Germany.'
 ],
 'SMR': [
  'San Marino traces its founding to Marinus, a Christian stonemason said to have established a community in 301 CE. This is a founding tradition, rather than a securely documented date.'
 ],
 'FRA': [
  'In 1682, King Louis XIV moved his court and government to Versailles. The palace turned royal power into a spectacle, with architecture and gardens that other European rulers sought to imitate.',
  'The French Revolution forced King Louis XVI to leave Versailles for Paris in 1789. The former royal residence was later preserved as a museum.'
 ],
 'EGY': [
  'The Nile’s annual floods supported agriculture in a desert landscape, helping sustain the kingdoms that built ancient Egypt’s monuments over thousands of years.',
  'Memphis was Egypt’s capital during the Old Kingdom. Its surrounding burial grounds include the step pyramid of Djoser at Saqqara and the pyramids of Giza.',
  'The Suez Canal opened in 1869, linking the Mediterranean and Red seas and making Egypt a crossroads of global shipping.'
 ],
 'FSM': [
  'Nan Madol, off Pohnpei, was the ceremonial center of the Saudeleur dynasty. Its stone buildings stand on artificial islets linked by canals—a striking example of Pacific island engineering.',
  'Yap’s chiefs received tribute from islands as far as 1,100 kilometers away, tying distant communities into an ocean-spanning network.',
  'Japan made Chuuk a major naval base in World War II. American attacks in 1944 devastated the base, while many other Micronesian islands were bypassed.'
 ],
 'PLW': [
  'Palau developed a matrilineal society in which high-ranking women chose the chiefs. Political authority was closely tied to family lineage.',
  'The 1944 battle for Peleliu was among the Pacific War’s bloodiest island battles. After the war, Palau became part of a United States-administered trust territory.',
  'Palau’s nuclear-free constitution complicated its agreement with the United States, which would take responsibility for defense. After seven unsuccessful referendums, an eighth vote helped clear the way to independence in 1994.'
 ],
 'JPN': [
  'The Tokugawa shogunate, a hereditary military government, began in 1603 after decades of civil war. More than two centuries of relative stability helped Japanese arts and urban culture flourish.',
  'The Treaty of Kanagawa opened Japanese ports to the United States in 1854. Japan then entered a period of rapid modernization and industrialization.',
  'Japan’s expansion across East Asia culminated in the Pacific War. Its 1941 attack on Pearl Harbor brought the United States into World War II.'
 ],
 'NGA': [
  'Long before British colonial rule, the region contained powerful states including Benin and Oyo in the west, and Borno and the Sokoto Caliphate in the north. Modern Nigeria brought many different political traditions within one border.',
  'Nigeria became independent from Britain in 1960. In 1967, the Eastern Region attempted to break away as Biafra, triggering a civil war that lasted until 1970.'
 ],
 'GBR': [
  'England and Scotland shared a monarch but remained separate kingdoms until the Acts of Union in 1707 created the Kingdom of Great Britain.',
  'At its greatest extent in the early 20th century, the British Empire covered roughly a quarter of the world’s land. Decolonization after World War II transformed Britain’s relationship with much of the world.'
 ],
 'VUT': [
  'Chief Roi Mata’s residence, death place and burial site preserve the memory of a ruler in early 17th-century central Vanuatu. Oral traditions and archaeology both illuminate his legacy of social reform and conflict resolution.',
  'From 1906, Britain and France jointly administered the New Hebrides, now Vanuatu. They maintained separate police forces, currencies and school systems on the same islands.'
 ],
 'USA': [
  'Thirteen British colonies declared independence in 1776. Britain recognized the United States in the 1783 Treaty of Paris, ending the Revolutionary War.',
  'The Civil War of 1861–1865 pitted the Union against a breakaway Confederacy of slave states. The Union’s victory preserved the country and ended slavery.',
  'During the Great Depression in the 1930s, about one quarter of the American labor force was unemployed.'
 ],
}

def historical_facts(background):
 sentences=[s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9“\"])',background) if len(s.strip())>35]
 candidates=[]
 for i,s in enumerate(sentences):
  years=[int(y) for y in re.findall(r'\b(1\d{3}|20\d{2})\b',s)]
  if years and max(years)>2005:continue
  if re.search(r'\b(ASSK|TTPI)\b|this policy|this tension',s):continue
  if re.search(r'\b(today|currently|current|ongoing|recent|remains|continues|has been|has pushed|is now|is one of|is a member|is an? (?:important|major|key))\b',s,re.I):continue
  # A bare leadership succession is not a historical story.
  if re.search(r'president|prime minister|election|elected',s,re.I) and not re.search(r'abolish|apartheid|slavery|genocide|independence|revolution',s,re.I):continue
  if re.match(r'(?:He |She |His |Her |This |These |It |Its |They |The latter |The former |Following this |In the aftermath of this )',s):continue
  if re.search(r'\b[A-Z]{4,}\b',s) and not re.search(r'king|queen|emperor|explorer|navigator|leader|general|dynasty|led by|under|colonial|genocide|Holocaust',s,re.I):continue
  historic=re.search(r'ancient|centur|millenn|BCE|empire|dynast|kingdom|settle|settlement|voyag|trade|trading|canal|railway|construct|independen|colon|revolution|slave|slavery|genocide|Holocaust|World War|WWII|civil war|partition|unif|annex|explor',s,re.I)
  if not historic and not years:continue
  if len(s)>550:continue
  score=8*bool(re.search(r'ancient|centur|millenn|BCE|dynast|settlement|voyag|trade|trading|canal|construct|slavery|slave trade',s,re.I))+5*bool(re.search(r'genocide|Holocaust|independen|empire|revolution',s,re.I))+2*(i<4)-len(s)/180
  candidates.append((score,i,s))
 # Preserve chronology within selected episodes, with a maximum of three.
 chosen=sorted(sorted(candidates,reverse=True)[:3],key=lambda x:x[1])
 facts=[s for _,_,s in chosen]
 # Keep historical people legible and explain their role when an excerpt omits it.
 contexts={'under ASHOKA':'under Emperor Ashoka','under MINDAUGAS':'under the ruler Mindaugas','under Maurice BISHOP':'under the revolutionary leader Maurice Bishop','under the strong hand of Josip Broz, aka TITO':'under the communist leader Josip Broz Tito','in 1865, Seru Epenisa CAKOBAU':'in 1865, the Fijian chief Seru Epenisa Cakobau'}
 for i,fact in enumerate(facts):
  for old,new in contexts.items():fact=fact.replace(old,new)
  facts[i]=re.sub(r'\b[A-Z]{4,}\b',lambda m:m[0] if m[0] in ['NATO','WWII','USSR'] else m[0].title(),fact)
 return facts
