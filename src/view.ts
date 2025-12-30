import { ItemView, WorkspaceLeaf, TFile, moment } from 'obsidian';
import { generateCalendar, getMonthName } from './calendar';
import { calculateStatistics, HabitStats, getNotesOnThisDay, getRandomQualityNote } from './stats';

// Интерфейс плагина
interface IHabitPlugin {
	getDailyNotes(): TFile[];
	settings: {
		dailyNotesFolder?: string; // legacy, для обратной совместимости
		watchedFolders: string;
		dateFormats: string;
	};
	app: any;
}

export const VIEW_TYPE_HABIT_TRACKER = 'habit-tracker-view';

type ViewMode = 'panorama' | 'year';

export class HabitTrackerView extends ItemView {
	plugin: IHabitPlugin;
	currentDate: moment.Moment;
	dailyNotes: TFile[] = [];
	stats: HabitStats;
	viewMode: ViewMode = 'panorama'; // По умолчанию - панорама

	constructor(leaf: WorkspaceLeaf, plugin: IHabitPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = window.moment();
	}

	getViewType() { return VIEW_TYPE_HABIT_TRACKER; }
	getDisplayText() { return 'Трекер Привычек'; }

	async onOpen() {
		this.updateData();
	}

	updateData() {
		this.dailyNotes = this.plugin.getDailyNotes();
		this.stats = calculateStatistics(this.dailyNotes);
		this.render();
	}

	/**
	 * Извлечь дату из файла, используя настроенные форматы
	 * Возвращает { date, type, originalFile } или null
	 */
	getDateFromFile(file: TFile): { date: moment.Moment; type: string; originalFile: TFile } | null {
		const formats = this.plugin.settings.dateFormats
			.split('\n')
			.map(f => f.trim())
			.filter(f => f.length > 0);

		const name = file.name.replace(/\.md$/, '');

		for (const format of formats) {
			const m = moment(name, format, true);
			if (m.isValid()) {
				// Определяем тип заметки
				const noteType = this.getNoteType(format);
				// Конвертируем периодические заметки в конкретные даты
				const convertedDate = this.convertPeriodicToDate(m, format);
				return { date: convertedDate, type: noteType, originalFile: file };
			}
		}
		return null;
	}

	/**
	 * Определить тип заметки по формату
	 */
	getNoteType(format: string): string {
		if (format.includes('gggg-[W]ww') || format.includes('GGGG-[W]WW')) return 'week';
		if (format === 'YYYY-MM') return 'month';
		if (format.includes('[Q]Q')) return 'quarter';
		if (format === 'YYYY' || format === 'gggg') return 'year';
		return 'day'; // Все дневные форматы
	}

	/**
	 * Конвертировать периодические заметки в конкретные даты для календаря
	 */
	convertPeriodicToDate(date: moment.Moment, format: string): moment.Moment {
		// Неделя (gggg-[W]ww) → понедельник этой недели
		if (format.includes('gggg-[W]ww') || format.includes('GGGG-[W]WW')) {
			return date.startOf('isoWeek'); // Понедельник
		}

		// Месяц (YYYY-MM) → 1-е число месяца
		if (format === 'YYYY-MM') {
			return date.startOf('month');
		}

		// Квартал (YYYY-[Q]Q) → 1-е число первого месяца квартала
		if (format.includes('[Q]Q') || format.includes('[Q]Q')) {
			return date.startOf('quarter');
		}

		// Год (YYYY) → 1 января
		if (format === 'YYYY' || format === 'gggg') {
			return date.startOf('year');
		}

		// Для дневных форматов просто возвращаем дату
		return date;
	}

	render() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;

		container.empty();
		container.addClass('habit-tracker-container');

		// 1. Заголовок и Переключатель
		const header = container.createEl('div', { cls: 'habit-tracker-header' });
		const titleRow = header.createEl('div', { cls: 'header-row' });
		titleRow.createEl('h2', { text: this.viewMode === 'panorama' ? '🏛 Панорама Времени' : '🗺 Карта Года' });

		// Кнопки переключения
		const modeSwitcher = header.createEl('div', { cls: 'mode-switcher' });
		const btnPanorama = modeSwitcher.createEl('button', {
			cls: `mode-btn ${this.viewMode === 'panorama' ? 'active' : ''}`,
			text: '3 Месяца'
		});
		const btnYear = modeSwitcher.createEl('button', {
			cls: `mode-btn ${this.viewMode === 'year' ? 'active' : ''}`,
			text: 'Весь Год'
		});

		btnPanorama.onclick = () => { this.viewMode = 'panorama'; this.render(); };
		btnYear.onclick = () => { this.viewMode = 'year'; this.render(); };

		const mainContent = container.createEl('div', { cls: 'habit-tracker-main' });

		// 2. Основной контент (зависит от режима)
		if (this.viewMode === 'panorama') {
			this.renderPanorama(mainContent);
		} else {
			this.renderYearHeatmap(mainContent);
		}

		// 3. Сайдбар (общий для всех режимов)
		const sidebar = mainContent.createEl('div', { cls: 'tracker-sidebar' });
		this.renderStatistics(sidebar);
		this.renderRetroModule(sidebar);
	}

	// === РЕЖИМ ПАНОРАМЫ ===
	renderPanorama(container: HTMLElement) {
		// Навигация по месяцам
		const navRow = container.createEl('div', { cls: 'panorama-nav' });
		const btnPrev = navRow.createEl('button', {
			cls: 'panorama-nav-btn',
			text: '◀ Назад'
		});
		const btnNext = navRow.createEl('button', {
			cls: 'panorama-nav-btn',
			text: 'Вперёд ▶'
		});
		const btnToday = navRow.createEl('button', {
			cls: 'panorama-nav-btn panorama-today-btn',
			text: '📅 Сегодня'
		});

		btnPrev.onclick = () => {
			this.currentDate.subtract(3, 'months');
			this.render();
		};

		btnNext.onclick = () => {
			this.currentDate.add(3, 'months');
			this.render();
		};

		btnToday.onclick = () => {
			this.currentDate = window.moment();
			this.render();
		};

		const calendarsWrapper = container.createEl('div', { cls: 'calendars-grid' });
		for (let i = -1; i <= 1; i++) {
			const monthDate = this.currentDate.clone().add(i, 'months');
			this.renderSingleMonth(calendarsWrapper, monthDate);
		}
	}

	// === РЕЖИМ ГОДА (HEATMAP) ===
	renderYearHeatmap(container: HTMLElement) {
		// Навигация по годам
		const navRow = container.createEl('div', { cls: 'heatmap-nav' });
		const btnPrevYear = navRow.createEl('button', {
			cls: 'heatmap-nav-btn',
			text: '◀ Пред. год'
		});
		const yearTitle = navRow.createEl('h3', {
			cls: 'heatmap-year-title',
			text: this.currentDate.year().toString()
		});
		const btnNextYear = navRow.createEl('button', {
			cls: 'heatmap-nav-btn',
			text: 'След. год ▶'
		});

		btnPrevYear.onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};

		btnNextYear.onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const heatmapContainer = container.createEl('div', { cls: 'heatmap-container' });

		// Создаём Map для быстрого поиска: dateStr -> { type, file }
		const notesMap = new Map<string, { type: string; file: TFile }>();

		this.dailyNotes.forEach(file => {
			const result = this.getDateFromFile(file);
			if (result) {
				const dateStr = result.date.format('YYYY-MM-DD');
				// Если несколько файлов на одну дату, сохраняем все
				if (!notesMap.has(dateStr)) {
					notesMap.set(dateStr, { type: result.type, file: result.originalFile });
				}
			}
		});

		// Генерируем даты с начала ТЕКУЩЕГО выбранного года
		const startOfYear = this.currentDate.clone().startOf('year');
		const endOfYear = this.currentDate.clone().endOf('year');
		const daysInYear = endOfYear.diff(startOfYear, 'days') + 1;

		// Сетка: 7 строк (дни недели), 53 столбца (недели)
		const grid = heatmapContainer.createEl('div', { cls: 'heatmap-grid' });

		// Добавляем пустые ячейки, если год начался не с понедельника
		let startDay = startOfYear.day(); // 0-Sun, 1-Mon
		startDay = startDay === 0 ? 6 : startDay - 1; // 0-Mon, 6-Sun

		for (let i = 0; i < startDay; i++) {
			grid.createEl('div', { cls: 'heatmap-day empty' });
		}

		for (let i = 0; i < daysInYear; i++) {
			const date = startOfYear.clone().add(i, 'days');
			const dateStr = date.format('YYYY-MM-DD');
			const noteInfo = notesMap.get(dateStr);

			// Определяем CSS класс на основе типа заметки
			let typeClass = '';
			let typeIcon = '📝';
			if (noteInfo) {
				switch (noteInfo.type) {
					case 'day':
						typeClass = 'type-day';
						typeIcon = '📅';
						break;
					case 'week':
						typeClass = 'type-week';
						typeIcon = '📆';
						break;
					case 'month':
						typeClass = 'type-month';
						typeIcon = '🗓️';
						break;
					case 'quarter':
						typeClass = 'type-quarter';
						typeIcon = '📊';
						break;
					case 'year':
						typeClass = 'type-year';
						typeIcon = '🎯';
						break;
				}
			}

			const dayEl = grid.createEl('div', {
				cls: `heatmap-day ${noteInfo ? 'active ' + typeClass : ''}`,
				attr: { 'aria-label': `${date.format('D MMM YYYY')} ${noteInfo ? typeIcon : '❌'}` }
			});

			if (noteInfo) {
				// При наведении показываем превью содержимого
				dayEl.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(noteInfo.file);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					dayEl.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};

				dayEl.onclick = () => {
					this.plugin.app.workspace.openLinkText(noteInfo.file.path, '', true);
				};
			}
		}
	}

	renderSingleMonth(parent: HTMLElement, date: moment.Moment) {
		const monthContainer = parent.createEl('div', { cls: 'month-unit' });
		// Название месяца
		monthContainer.createEl('h4', {
			text: `${getMonthName(date)} ${date.year()}`,
			cls: 'month-label'
		});

		const grid = monthContainer.createEl('div', { cls: 'calendar-grid mini' });

		// Дни недели
		const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
		weekdays.forEach(d => grid.createEl('div', { cls: 'calendar-day-header', text: d }));

		// Дни
		const calendarDays = generateCalendar(date);

		// Map: дата (YYYY-MM-DD) -> { type, file }
		const notesMap = new Map<string, { type: string; file: TFile }>();
		this.dailyNotes.forEach((file) => {
			const result = this.getDateFromFile(file);
			if (result) {
				const dateStr = result.date.format('YYYY-MM-DD');
				if (!notesMap.has(dateStr)) {
					notesMap.set(dateStr, { type: result.type, file: result.originalFile });
				}
			}
		});

		const today = window.moment().format('YYYY-MM-DD');

		calendarDays.forEach((day) => {
			const dayEl = grid.createEl('div', { cls: 'calendar-day' });
			if (day) {
				const dateStr = day.format('YYYY-MM-DD');
				const noteInfo = notesMap.get(dateStr);

				dayEl.createEl('div', { cls: 'calendar-day-number', text: day.date().toString() });

				// Добавляем класс в зависимости от типа заметки
				if (noteInfo) {
					dayEl.addClass(`calendar-day-with-note type-${noteInfo.type}`);

					// При наведении показываем превью
					dayEl.onmouseenter = async () => {
						const content = await this.plugin.app.vault.read(noteInfo.file);
						const preview = content.slice(0, 150).replace(/[#*`]/g, '');
						dayEl.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
					};
				}

				if (dateStr === today) dayEl.addClass('calendar-day-today');

				// Если есть заметка - открываем её, если нет - создаём новую
				dayEl.onclick = () => {
					if (noteInfo) {
						this.plugin.app.workspace.openLinkText(noteInfo.file.path, '', true);
					} else {
						this.openDailyNote(dateStr);
					}
				};

				// Тултип с датой
				dayEl.ariaLabel = dateStr;
			}
		});
	}

	renderStatistics(container: HTMLElement) {
		const statsBox = container.createEl('div', { cls: 'stats-container' });
		statsBox.createEl('h3', { text: '📈 Прогресс' });

		// Подсчет заметок по типам
		const typeCounts = { day: 0, week: 0, month: 0, quarter: 0, year: 0 };
		this.dailyNotes.forEach(file => {
			const result = this.getDateFromFile(file);
			if (result && typeCounts[result.type as keyof typeof typeCounts] !== undefined) {
				typeCounts[result.type as keyof typeof typeCounts]++;
			}
		});

		// Базовые метрики
		statsBox.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>🔥 Текущая серия:</strong> ${this.stats.currentStreak} дн.`;
		statsBox.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>📅 Последняя запись:</strong> ${this.stats.lastNoteDate}`;
		statsBox.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>⏰ Прошло времени:</strong> ${this.stats.timeSinceLastNote}`;

		// Разделитель
		statsBox.createEl('hr', { cls: 'stat-divider' });

		// Детализация по типам
		statsBox.createEl('p', { cls: 'stat-item stat-header' }).innerHTML = '<strong>📊 Заметки по типам:</strong>';
		statsBox.createEl('p', { cls: 'stat-item stat-type-day' }).innerHTML = `📅 Дневные: <strong>${typeCounts.day}</strong>`;
		statsBox.createEl('p', { cls: 'stat-item stat-type-week' }).innerHTML = `📆 Недельные: <strong>${typeCounts.week}</strong>`;
		statsBox.createEl('p', { cls: 'stat-item stat-type-month' }).innerHTML = `🗓️ Месячные: <strong>${typeCounts.month}</strong>`;
		statsBox.createEl('p', { cls: 'stat-item stat-type-quarter' }).innerHTML = `📊 Квартальные: <strong>${typeCounts.quarter}</strong>`;
		statsBox.createEl('p', { cls: 'stat-item stat-type-year' }).innerHTML = `🎯 Годовые: <strong>${typeCounts.year}</strong>`;

		// Всего заметок
		statsBox.createEl('hr', { cls: 'stat-divider' });
		statsBox.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>📝 Всего заметок:</strong> ${this.dailyNotes.length}`;

		// Процент заполнения за год
		const yearStart = window.moment().startOf('year');
		const yearEnd = window.moment().endOf('year');
		const daysInYear = yearEnd.diff(yearStart, 'days') + 1;
		const daysPassed = window.moment().diff(yearStart, 'days') + 1;
		const dayNotes = typeCounts.day;
		const fillPercentage = daysPassed > 0 ? Math.round((dayNotes / daysPassed) * 100) : 0;

		statsBox.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>📈 Заполнение года:</strong> ${fillPercentage}%`;
	}

	// === НОВЫЙ МОДУЛЬ РЕТРОСПЕКТИВЫ ===
	async renderRetroModule(container: HTMLElement) {
		const retroBox = container.createEl('div', { cls: 'memory-box' });

		// Заголовок и кнопки управления
		const header = retroBox.createEl('div', { cls: 'retro-header' });
		header.createEl('h3', { text: '🕰 Ретроспектива' });

		const controls = retroBox.createEl('div', { cls: 'retro-controls' });

		const btnToday = controls.createEl('button', { cls: 'retro-btn', text: '📅 В этот день' });
		const btnRandom = controls.createEl('button', { cls: 'retro-btn', text: '🎲 Случайно' });

		const previewContainer = retroBox.createEl('div', { cls: 'memory-preview' });
		previewContainer.createEl('p', { cls: 'preview-empty', text: 'Выберите режим просмотра' });

		// Логика кнопок
		btnToday.onclick = async () => {
			const notes = getNotesOnThisDay(this.dailyNotes);
			if (notes.length > 0) {
				// Берем самую старую заметку "в этот день" (чтобы видеть прогресс)
				const note = notes[0];
				await this.showPreviewInPanel(note, previewContainer, `Запись от ${note.name.replace('.md', '')}`);
			} else {
				previewContainer.empty();
				previewContainer.createEl('p', { text: 'Нет записей в этот день в прошлые годы.' });
			}
		};

		btnRandom.onclick = async () => {
			const note = await getRandomQualityNote(this.plugin.app, this.dailyNotes);
			if (note) {
				await this.showPreviewInPanel(note, previewContainer, `Случайная мысль (${note.name.replace('.md', '')})`);
			}
		};

		// Сразу пытаемся показать "В этот день" при загрузке
		btnToday.click();
	}

	async showPreviewInPanel(file: TFile, container: HTMLElement, title: string = '') {
		const content = await this.plugin.app.vault.read(file);
		container.empty();

		if (title) {
			const titleEl = container.createEl('h4', { cls: 'preview-date' });
			titleEl.textContent = title;
		}

		// Показываем всю заметку, а не кусочек
		const contentEl = container.createEl('div', { cls: 'preview-content' });
		contentEl.textContent = content;

		// Кнопка "Открыть в Obsidian" для перехода к заметке
		const btn = container.createEl('button', { cls: 'preview-open-button', text: '📂 Открыть в Obsidian' });
		btn.onclick = () => this.plugin.app.workspace.openLinkText(file.path, '', true);
	}

	async openDailyNote(dateStr: string) {
		// Используем первую папку и первый формат из настроек
		const folders = this.plugin.settings.watchedFolders.split('\n').map(f => f.trim()).filter(f => f.length > 0);
		const formats = this.plugin.settings.dateFormats.split('\n').map(f => f.trim()).filter(f => f.length > 0);

		const folder = folders[0] || 'Daily Notes';
		const format = formats[0] || 'YYYY-MM-DD';

		// Формируем имя файла из даты
		const fileName = moment(dateStr).format(format);
		const notePath = `${folder}/${fileName}.md`;
		const file = this.plugin.app.vault.getAbstractFileByPath(notePath);

		if (file instanceof TFile) {
			await this.plugin.app.workspace.openLinkText(notePath, '', true);
		} else {
			// Создаём папку, если не существует
			if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
				await this.plugin.app.vault.createFolder(folder);
			}
			await this.plugin.app.vault.create(notePath, '');
			await this.plugin.app.workspace.openLinkText(notePath, '', true);
			this.updateData();
		}
	}
}
