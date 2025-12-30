import { TFile } from 'obsidian';

export interface HabitStats {
	lastNoteDate: string;
	currentStreak: number;
	timeSinceLastNote: string;
}

/**
 * Рассчитать статистику на основе списка daily notes
 */
export function calculateStatistics(notes: TFile[]): HabitStats {
	if (notes.length === 0) {
		return {
			lastNoteDate: '',
			currentStreak: 0,
			timeSinceLastNote: 'Нет записей',
		};
	}

	// Извлечь даты из имен файлов, используя все поддерживаемые форматы
	const formats = ['DD.MM.YY', 'DD.MM.YYYY', 'YYYY-MM-DD', 'gggg-[W]ww', 'YYYY-MM', 'YYYY-[Q]Q', 'YYYY'];

	const dates: moment.Moment[] = notes
		.map((file) => {
			const name = file.name.replace(/\.md$/, '');
			// Пробуем все форматы
			for (const format of formats) {
				const m = window.moment(name, format, true);
				if (m.isValid()) {
					// Для периодических заметок используем первый день периода
					if (format.includes('gggg-[W]ww') || format.includes('GGGG-[W]WW')) {
						return m.startOf('isoWeek');
					}
					if (format === 'YYYY-MM') {
						return m.startOf('month');
					}
					if (format.includes('[Q]Q')) {
						return m.startOf('quarter');
					}
					if (format === 'YYYY' || format === 'gggg') {
						return m.startOf('year');
					}
					return m;
				}
			}
			return null;
		})
		.filter((date): date is moment.Moment => date !== null)
		.sort((a, b) => (a.isBefore(b) ? 1 : -1)); // Сортировка по убыванию

	if (dates.length === 0) {
		return {
			lastNoteDate: '',
			currentStreak: 0,
			timeSinceLastNote: 'Нет записей',
		};
	}

	// Последняя заметка
	const lastNote = dates[0];
	const lastNoteDate = lastNote.format('DD MMM YYYY');

	// Текущая серия (streak) - считаем только дневные заметки
	const today = window.moment().startOf('day');
	const yesterday = today.clone().subtract(1, 'day');

	// Фильтруем только дневные заметки (не недельные, месячные и т.д.)
	const dailyDates = dates.filter(d => {
		// Проверяем, что дата не является началом периода (1-е число месяца/года, понедельник)
		const day = d.date();
		const monthDay = d.format('MM-DD');
		const weekDay = d.day();

		// Исключаем: 1 января, 1-е число месяца, понедельники (для недельных заметок)
		const isYearStart = monthDay === '01-01';
		const isMonthStart = day === 1;
		const isWeekStart = weekDay === 1; // Понедельник

		return !isYearStart && !isMonthStart && !isWeekStart;
	});

	let currentStreak = 0;
	if (dailyDates.length > 0) {
		const lastDailyNote = dailyDates[0];

		// Если последняя дневная заметка была сегодня или вчера, начинаем считать streak
		if (lastDailyNote.isSame(today, 'day') || lastDailyNote.isSame(yesterday, 'day')) {
			currentStreak = 1;

			// Идем назад по дням
			let checkDate = lastDailyNote.clone().subtract(1, 'day');
			for (let i = 1; i < dailyDates.length; i++) {
				if (dailyDates[i].isSame(checkDate, 'day')) {
					currentStreak++;
					checkDate.subtract(1, 'day');
				} else {
					break;
				}
			}
		}
	}

	// Время с последней заметки
	const now = window.moment();
	const diffDays = now.diff(lastNote, 'days');
	const diffHours = now.diff(lastNote, 'hours');
	const diffMinutes = now.diff(lastNote, 'minutes');

	let timeSinceLastNote: string;
	if (diffDays === 0) {
		if (diffHours === 0) {
			timeSinceLastNote = `${diffMinutes} минут назад`;
		} else {
			timeSinceLastNote = `${diffHours} час${getHoursSuffix(diffHours)} назад`;
		}
	} else if (diffDays === 1) {
		timeSinceLastNote = 'вчера';
	} else {
		timeSinceLastNote = `${diffDays} дн${getDaysSuffix(diffDays)} назад`;
	}

	return {
		lastNoteDate,
		currentStreak,
		timeSinceLastNote,
	};
}

/**
 * Получить правильное окончание для слова "день"
 */
function getDaysSuffix(days: number): string {
	const lastTwo = days % 100;
	const lastOne = days % 10;

	if (lastTwo >= 11 && lastTwo <= 19) {
		return 'ей';
	}

	switch (lastOne) {
		case 1:
			return 'ь';
		case 2:
		case 3:
		case 4:
			return 'я';
		default:
			return 'ей';
	}
}

/**
 * Получить правильное окончание для слова "час"
 */
function getHoursSuffix(hours: number): string {
	const lastTwo = hours % 100;
	const lastOne = hours % 10;

	if (lastTwo >= 11 && lastTwo <= 19) {
		return 'ов';
	}

	switch (lastOne) {
		case 1:
			return '';
		case 2:
		case 3:
		case 4:
			return 'а';
		default:
			return 'ов';
	}
}

// === НОВЫЕ ФУНКЦИИ ДЛЯ РЕТРОСПЕКТИВЫ ===

/**
 * Найти заметки, созданные в этот день (MM-DD) в прошлые годы
 */
export function getNotesOnThisDay(notes: TFile[]): TFile[] {
	const today = window.moment();
	const todayMonth = today.month() + 1; // moment.js месяца 0-11
	const todayDay = today.date();

	const formats = ['DD.MM.YY', 'DD.MM.YYYY', 'YYYY-MM-DD'];

	return notes.filter(file => {
		const name = file.name.replace(/\.md$/, '');

		// Пробуем распарсить дату
		for (const format of formats) {
			const m = window.moment(name, format, true);
			if (m.isValid()) {
				// Проверяем, что месяц и день совпадают с сегодняшним
				const fileMonth = m.month() + 1;
				const fileDay = m.date();

				if (fileMonth === todayMonth && fileDay === todayDay) {
					// Исключаем сегодняшнюю заметку
					if (!m.isSame(today, 'day')) {
						return true;
					}
				}
			}
		}
		return false;
	});
}

/**
 * Получить случайную "качественную" заметку (длиннее 50 символов)
 */
export async function getRandomQualityNote(app: any, notes: TFile[]): Promise<TFile | null> {
	if (notes.length === 0) return null;

	// Пробуем найти длинную заметку (до 10 попыток), чтобы не зависать
	for (let i = 0; i < 10; i++) {
		const randomNote = notes[Math.floor(Math.random() * notes.length)];
		const content = await app.vault.read(randomNote);
		if (content.length > 50) { // Критерий качества: > 50 символов
			return randomNote;
		}
	}
	// Если не нашли длинную, возвращаем любую
	return notes[Math.floor(Math.random() * notes.length)];
}
