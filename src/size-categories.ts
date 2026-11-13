export const sizeCategories={classic:'Classic','pop-culture':'Pop culture',geography:'Geography'} as const;
export type SizeCategory=keyof typeof sizeCategories;
export function sizeCategoryForEntry(entry:string):SizeCategory{return entry.startsWith('size-pop-culture-')?'pop-culture':entry.startsWith('size-geography-')?'geography':'classic';}
export function sizeCategoryMarkup(selected:SizeCategory){return `<nav class="size-categories" aria-label="Size categories">${Object.entries(sizeCategories).map(([key,label])=>`<button type="button" data-size-category="${key}" aria-pressed="${key===selected}">${label}</button>`).join('')}</nav>`;}
