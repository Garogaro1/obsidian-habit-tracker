import { App, TFile, moment } from 'obsidian';

export interface HabitStats {
	lastNoteDate: string;
	currentStreak: number;
	timeSinceLastNote: string;
}

/**
 * Рассчитать статистику.
 * Принимает список файлов и СПИСОК ФОРМАТОВ из настроек.
 */
export function calculateStatistics(notes: TFile[], formatString: string): HabitStats {
	if (notes.length === 0) {
		return { lastNoteDate: '', currentStreak: 0, timeSinceLastNote: 'Нет записей' };
	}

	const formats = formatString.split('\n').map(f => f.trim()).filter(f => f.length > 0);

	// Собираем валидные даты и их типы
	const parsedNotes = notes.map(file => {
		const name = file.name.replace(/\.md$/, '');
		for (const format of formats) {
			const m = moment(name, format, true);
			if (m.isValid()) {
				// Определяем тип заметки по формату
				let type = 'day';
				if (format.includes('gggg-[W]ww') || format.includes('W')) type = 'week';
				else if (format === 'YYYY-MM') type = 'month';
				else if (format.includes('Q')) type = 'quarter';
				else if (format === 'YYYY') type = 'year';

				return { moment: m, type: type };
			}
		}
		return null;
	}).filter(n => n !== null) as { moment: moment.Moment, type: string }[];

	// Сортируем по убыванию даты
	parsedNotes.sort((a, b) => b.moment.valueOf() - a.moment.valueOf());

	if (parsedNotes.length === 0) {
		return { lastNoteDate: '', currentStreak: 0, timeSinceLastNote: 'Нет валидных дат' };
	}

	const lastNote = parsedNotes[0].moment;
	const lastNoteDate = lastNote.format('DD MMM YYYY');

	// --- РАСЧЕТ STREAK (Только для дневных заметок) ---
	const dailyNotesDates = parsedNotes
		.filter(n => n.type === 'day')
		.map(n => n.moment.format('YYYY-MM-DD')); // Используем строки для уникальности

	const uniqueDates = new Set(dailyNotesDates);

	let currentStreak = 0;
	const today = moment().startOf('day');
	const yesterday = today.clone().subtract(1, 'day');
	const todayStr = today.format('YYYY-MM-DD');
	const yesterdayStr = yesterday.format('YYYY-MM-DD');

	// Если есть запись сегодня или вчера — серия жива
	if (uniqueDates.has(todayStr) || uniqueDates.has(yesterdayStr)) {
		currentStreak = 1;
		let checkDate = (uniqueDates.has(todayStr) ? today : yesterday).clone().subtract(1, 'day');

		while (true) {
			if (uniqueDates.has(checkDate.format('YYYY-MM-DD'))) {
				currentStreak++;
				checkDate.subtract(1, 'day');
			} else {
				break;
			}
		}
	}

	// --- ВРЕМЯ С ПОСЛЕДНЕЙ ЗАПИСИ ---
	const now = moment();
	const diffDays = now.diff(lastNote, 'days');

	let timeSinceLastNote;
	if (diffDays === 0) timeSinceLastNote = 'сегодня';
	else if (diffDays === 1) timeSinceLastNote = 'вчера';
	else timeSinceLastNote = `${diffDays} дн. назад`;

	return { lastNoteDate, currentStreak, timeSinceLastNote };
}

// === РЕТРОСПЕКТИВА ===

export function getNotesOnThisDay(notes: TFile[]): TFile[] {
	const todayMonthDay = moment().format('MM-DD'); // 12-30
	const todayDayMonth = moment().format('DD.MM'); // 30.12

	return notes.filter(file => {
		// Простая проверка вхождения подстроки (работает для большинства форматов)
		return file.name.includes(todayMonthDay) || file.name.includes(todayDayMonth);
	});
}

export async function getRandomQualityNote(app: App, notes: TFile[]): Promise<TFile | null> {
	if (notes.length === 0) return null;

	for (let i = 0; i < 5; i++) {
		try {
			const randomNote = notes[Math.floor(Math.random() * notes.length)];
			const content = await app.vault.read(randomNote);
			if (content.length > 30) return randomNote;
		} catch (error) {
			console.error('Error reading file:', error);
		}
	}
	return notes[Math.floor(Math.random() * notes.length)];
}
