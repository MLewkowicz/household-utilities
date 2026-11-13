export const sizeCategories={classic:'Classic','pop-culture':'Pop culture',geography:'Geography'} as const;
export type SizeCategory=keyof typeof sizeCategories;
export const SIZE_VERSION=11;
export const SIZE_ENTRY_PREFIX='size-v11-';
export const SIZE_PRACTICE_BOARDS=30;
export const isSizeEntry=(entry:string)=>/^size-v11-(classic|pop-culture|geography)-(30|[12][0-9]|[1-9])$/.test(entry);
export function sizeCategoryForEntry(entry:string):SizeCategory{return entry.startsWith(`${SIZE_ENTRY_PREFIX}pop-culture-`)?'pop-culture':entry.startsWith(`${SIZE_ENTRY_PREFIX}geography-`)?'geography':'classic';}
export function sizeCategoryMarkup(selected:SizeCategory){return `<nav class="size-categories" aria-label="Size categories">${Object.entries(sizeCategories).map(([key,label])=>`<button type="button" data-size-category="${key}" aria-pressed="${key===selected}">${label}</button>`).join('')}</nav>`;}
