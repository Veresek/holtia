import { vi } from 'vitest';

import { AROUND_NOW_GROW_MEDIA, AROUND_NOW_GROW_MIN_WIDTH } from '../time';

export function stubPreviewOverflow() {
	return vi
		.spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
		.mockReturnValue(1000);
}

export function stubAroundNowViewport(desktop: boolean) {
	vi.stubGlobal(
		'innerWidth',
		desktop ? AROUND_NOW_GROW_MIN_WIDTH : AROUND_NOW_GROW_MIN_WIDTH - 1,
	);
	vi.stubGlobal(
		'matchMedia',
		(query: string): MediaQueryList => ({
			matches: desktop && query === AROUND_NOW_GROW_MEDIA,
			media: query,
			onchange: null,
			addListener() {},
			removeListener() {},
			addEventListener() {},
			removeEventListener() {},
			dispatchEvent() {
				return false;
			},
		}),
	);
}

export function stubAroundNowSlotHeight(height: number, desktop = true) {
	stubAroundNowViewport(desktop);
	return vi
		.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
		.mockReturnValue({
			x: 0,
			y: 0,
			width: 0,
			height,
			top: 0,
			right: 0,
			bottom: height,
			left: 0,
			toJSON() {
				return {};
			},
		});
}
