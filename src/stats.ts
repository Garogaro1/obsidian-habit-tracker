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

	// Извлечь даты из имен файлов
	const dates: moment.Moment[] = notes
		.map((file) => {
			const match = file.name.match(/(\d{4}-\d{2}-\d{2})\.md/);
			return match ? window.moment(match[1]) : null;
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

	// Текущая серия (streak)
	let currentStreak = 0;
	const today = window.moment().startOf('day');
	const yesterday = today.clone().subtract(1, 'day');

	// Если последняя заметка была сегодня или вчера, начинаем считать streak
	if (lastNote.isSame(today, 'day') || lastNote.isSame(yesterday, 'day')) {
		currentStreak = 1;

		// Идем назад по дням
		let checkDate = lastNote.clone().subtract(1, 'day');
		for (let i = 1; i < dates.length; i++) {
			if (dates[i].isSame(checkDate, 'day')) {
				currentStreak++;
				checkDate.subtract(1, 'day');
			} else {
				break;
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
	const todayMonthDay = window.moment().format('MM-DD');
	return notes.filter(file => {
		// Ищем файлы, где месяц и день совпадают, а год - любой
		return file.name.includes(todayMonthDay);
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
