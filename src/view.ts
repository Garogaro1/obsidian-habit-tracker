import { ItemView, WorkspaceLeaf, TFile, moment } from 'obsidian';
import { generateCalendar, getMonthName } from './calendar';
import { calculateStatistics, HabitStats, getNotesOnThisDay, getRandomQualityNote } from './stats';

interface IHabitPlugin {
	getDailyNotes(): TFile[];
	settings: {
		watchedFolders: string;
		dateFormats: string;
	};
	app: any;
}

export const VIEW_TYPE_HABIT_TRACKER = 'habit-tracker-view';

type ViewMode = 'panorama' | 'year' | 'quarters' | 'months' | 'weeks' | 'years' | 'overview';

export class HabitTrackerView extends ItemView {
	plugin: IHabitPlugin;
	currentDate: moment.Moment;
	dailyNotes: TFile[] = [];
	stats: HabitStats;
	viewMode: ViewMode = 'panorama';

	constructor(leaf: WorkspaceLeaf, plugin: IHabitPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = moment(); // Используем импортированный moment
	}

	getViewType() { return VIEW_TYPE_HABIT_TRACKER; }
	getDisplayText() { return 'Трекер Привычек'; }

	async onOpen() {
		this.updateData();
	}

	updateData() {
		this.dailyNotes = this.plugin.getDailyNotes();
		// Передаем форматы из настроек в статистику!
		this.stats = calculateStatistics(this.dailyNotes, this.plugin.settings.dateFormats);
		this.render();
	}

	// Хелпер: Получить данные о файле (дата и тип)
	getFileData(file: TFile): { date: moment.Moment, type: string } | null {
		const formats = this.plugin.settings.dateFormats.split('\n').map(f => f.trim()).filter(f => f.length > 0);
		const name = file.name.replace('.md', '');

		for (const format of formats) {
			const m = moment(name, format, true);
			if (m.isValid()) {
				let type = 'day';
				// Простая эвристика типов
				if (format.includes('W')) type = 'week';
				else if (format.includes('Q')) type = 'quarter';
				else if (format === 'YYYY') type = 'year';
				else if (format === 'YYYY-MM') type = 'month';

				// Нормализация даты для календаря
				if (type === 'week') m.startOf('isoWeek');
				if (type === 'month') m.startOf('month');
				if (type === 'quarter') m.startOf('quarter');
				if (type === 'year') m.startOf('year');

				return { date: m, type };
			}
		}
		return null;
	}

	render() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass('habit-tracker-container');

		// Header
		const header = container.createEl('div', { cls: 'habit-tracker-header' });
		const row = header.createEl('div', { cls: 'header-row' });

		const titles = {
			'panorama': '🏛 Панорама (3 месяца)',
			'year': '🗺 Карта Года (дни)',
			'quarters': '📊 Кварталы',
			'months': '🗓️ Месяцы',
			'weeks': '📆 Недели',
			'years': '🎯 Годы',
			'overview': '📆 Обзор Месяцев'
		};
		row.createEl('h2', { text: titles[this.viewMode] });

		const switcher = row.createEl('div', { cls: 'mode-switcher' });
		switcher.createEl('button', { text: '3 Мес', cls: `mode-btn ${this.viewMode === 'panorama' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'panorama'; this.render(); };
		switcher.createEl('button', { text: 'Дни', cls: `mode-btn ${this.viewMode === 'year' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'year'; this.render(); };
		switcher.createEl('button', { text: 'Кварталы', cls: `mode-btn ${this.viewMode === 'quarters' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'quarters'; this.render(); };
		switcher.createEl('button', { text: 'Месяцы', cls: `mode-btn ${this.viewMode === 'months' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'months'; this.render(); };
		switcher.createEl('button', { text: 'Недели', cls: `mode-btn ${this.viewMode === 'weeks' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'weeks'; this.render(); };
		switcher.createEl('button', { text: 'Годы', cls: `mode-btn ${this.viewMode === 'years' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'years'; this.render(); };
		switcher.createEl('button', { text: 'Обзор', cls: `mode-btn ${this.viewMode === 'overview' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'overview'; this.render(); };

		const mainContent = container.createEl('div', { cls: 'habit-tracker-main' });

		if (this.viewMode === 'panorama') this.renderPanorama(mainContent);
		else if (this.viewMode === 'year') this.renderYearHeatmap(mainContent);
		else if (this.viewMode === 'quarters') this.renderQuarters(mainContent);
		else if (this.viewMode === 'months') this.renderPeriodicMonths(mainContent);
		else if (this.viewMode === 'weeks') this.renderPeriodicWeeks(mainContent);
		else if (this.viewMode === 'years') this.renderPeriodicYears(mainContent);
		else if (this.viewMode === 'overview') this.renderMonthsOverview(mainContent);

		const sidebar = mainContent.createEl('div', { cls: 'tracker-sidebar' });
		this.renderStatistics(sidebar);
		this.renderRetroModule(sidebar);
	}

	renderPanorama(container: HTMLElement) {
		const nav = container.createEl('div', { cls: 'panorama-nav' });
		nav.createEl('button', { text: '◀ Квартал', cls: 'mode-btn' }).onclick = () => { this.currentDate.subtract(3, 'months'); this.render(); };
		nav.createEl('span', { text: 'Сегодня', cls: 'mode-btn' }).onclick = () => { this.currentDate = moment(); this.render(); };
		nav.createEl('button', { text: 'Квартал ▶', cls: 'mode-btn' }).onclick = () => { this.currentDate.add(3, 'months'); this.render(); };

		// Показываем текущий квартал (3 месяца)
		const quarterStart = this.currentDate.clone().startOf('quarter');
		const grid = container.createEl('div', { cls: 'calendars-grid' });

		for (let i = 0; i < 3; i++) {
			const monthDate = quarterStart.clone().add(i, 'months');
			this.renderSingleMonth(grid, monthDate);
		}
	}

	renderYearHeatmap(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'heatmap-container' });
		const grid = wrapper.createEl('div', { cls: 'heatmap-grid' });

		// Карта: YYYY-MM-DD -> {file, type}
		const notesMap = new Map<string, {file: TFile, type: string}>();
		this.dailyNotes.forEach(f => {
			const data = this.getFileData(f);
			if(data) notesMap.set(data.date.format('YYYY-MM-DD'), { file: f, type: data.type });
		});

		const start = moment().startOf('year'); // Всегда текущий год для хитмэпа
		const days = moment().endOf('year').dayOfYear();

		// GitHub style: 7 rows (days of week)
		// Для простоты рисуем по дням подряд, CSS Grid сам выстроит (grid-auto-flow: column)

		// Заполняем смещение до начала года
		// (Этот код упрощен, для настоящего GitHub style нужна сложная математика сетки,
		// но текущий CSS сделает простую змейку)

		for(let i=0; i<days; i++) {
			const d = start.clone().add(i, 'days');
			const dStr = d.format('YYYY-MM-DD');
			const note = notesMap.get(dStr);

			const cell = grid.createEl('div', {
				cls: `heatmap-day ${note ? 'active type-' + note.type : ''}`,
				attr: { 'aria-label': `${d.format('D MMM')} ${note ? '✅' : ''}` }
			});

			if (note) {
				// Preview при наведении
				cell.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(note.file);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					cell.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};

				cell.onclick = () => this.plugin.app.workspace.openLinkText(note.file.path, '', true);
			}
		}
	}

	renderSingleMonth(parent: HTMLElement, date: moment.Moment) {
		const box = parent.createEl('div', { cls: 'month-unit' });
		box.createEl('h4', { cls: 'month-label', text: `${getMonthName(date)} ${date.year()}` });
		const grid = box.createEl('div', { cls: 'calendar-grid mini' });

		['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(t => grid.createEl('div', { cls: 'calendar-day-header', text: t }));

		const days = generateCalendar(date);
		const notesMap = new Map<string, {file: TFile, type: string}>();
		this.dailyNotes.forEach(f => {
			const data = this.getFileData(f);
			if(data) notesMap.set(data.date.format('YYYY-MM-DD'), { file: f, type: data.type });
		});

		const today = moment().format('YYYY-MM-DD');

		days.forEach(d => {
			const cell = grid.createEl('div', { cls: 'calendar-day' });
			if (d) {
				const dStr = d.format('YYYY-MM-DD');
				const note = notesMap.get(dStr);

				cell.createEl('div', { text: d.date().toString() });

				if (note) {
					cell.addClass('calendar-day-with-note');
					cell.addClass(`type-${note.type}`); // Добавляем класс типа!

					// Preview при наведении
					cell.onmouseenter = async () => {
						const content = await this.plugin.app.vault.read(note.file);
						const preview = content.slice(0, 150).replace(/[#*`]/g, '');
						cell.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
					};

					cell.onclick = () => this.plugin.app.workspace.openLinkText(note.file.path, '', true);
				} else {
					// Создание новой заметки
					cell.onclick = () => this.createNote(dStr);
				}

				if (dStr === today) cell.addClass('calendar-day-today');
				cell.ariaLabel = dStr;
			}
		});
	}

	// === КВАРТАЛЫ (отдельный вид) ===
	renderQuarters(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		nav.createEl('h3', { cls: 'heatmap-year-title', text: `Кварталы ${currentYear}` });

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const quartersGrid = wrapper.createEl('div', { cls: 'quarters-grid' });
		for (let q = 1; q <= 4; q++) {
			const quarterStart = moment().year(currentYear).quarter(q).startOf('quarter');

			// Ищем квартальную заметку
			const quarterFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'quarter' &&
					   data.date.year() === currentYear &&
					   data.date.quarter() === q;
			});

			const quarterCard = quartersGrid.createEl('div', {
				cls: `quarter-card ${quarterFile ? 'quarter-with-note' : ''}`
			});

			const monthsInQuarter = [];
			for (let m = 0; m < 3; m++) {
				const mDate = quarterStart.clone().add(m, 'months');
				monthsInQuarter.push(getMonthName(mDate).slice(0, 3));
			}

			quarterCard.createEl('div', { cls: 'quarter-title', text: `Q${q}` });
			quarterCard.createEl('div', { cls: 'quarter-months', text: monthsInQuarter.join(' • ') });

			if (quarterFile) {
				quarterCard.createEl('div', { cls: 'quarter-badge', text: '✅ Есть заметка' });

				quarterCard.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(quarterFile);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					quarterCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};

				quarterCard.onclick = () => this.plugin.app.workspace.openLinkText(quarterFile.path, '', true);
			} else {
				quarterCard.createEl('div', { cls: 'quarter-badge quarter-empty', text: '❌ Нет заметки' });
				quarterCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${currentYear}-Q${q}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}
	}

	// === МЕСЯЦЫ (отдельный вид) ===
	renderPeriodicMonths(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		nav.createEl('h3', { cls: 'heatmap-year-title', text: `Месяцы ${currentYear}` });

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const monthsGrid = wrapper.createEl('div', { cls: 'periodic-months-grid' });

		for (let m = 0; m < 12; m++) {
			const monthDate = moment().year(currentYear).month(m);
			const monthFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'month' &&
					   data.date.year() === currentYear &&
					   data.date.month() === m;
			});

			const monthCard = monthsGrid.createEl('div', {
				cls: `periodic-month-card ${monthFile ? 'periodic-month-with-note' : ''}`
			});

			monthCard.createEl('div', { cls: 'periodic-month-name', text: getMonthName(monthDate).slice(0, 3) });

			if (monthFile) {
				monthCard.addClass('periodic-month-has-note');

				monthCard.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(monthFile);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					monthCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};

				monthCard.onclick = () => this.plugin.app.workspace.openLinkText(monthFile.path, '', true);
			} else {
				monthCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${monthDate.format('YYYY-MM')}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}
	}

	// === НЕДЕЛИ (отдельный вид) ===
	renderPeriodicWeeks(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		nav.createEl('h3', { cls: 'heatmap-year-title', text: `Недели ${currentYear}` });

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const weeksByMonth = wrapper.createEl('div', { cls: 'weeks-by-month' });

		for (let m = 0; m < 12; m++) {
			const monthDate = moment().year(currentYear).month(m);
			const monthStart = monthDate.clone().startOf('month');
			const monthEnd = monthDate.clone().endOf('month');

			// Ищем все недельные заметки в этом месяце
			const weeksInMonth = [];
			let currentWeek = monthStart.clone().startOf('isoWeek');

			while (currentWeek.isBefore(monthEnd) || currentWeek.isSame(monthEnd, 'day')) {
				const weekFile = this.dailyNotes.find(file => {
					const data = this.getFileData(file);
					return data && data.type === 'week' &&
						   data.date.year() === currentYear &&
						   data.date.isoWeek() === currentWeek.isoWeek();
				});

				weeksInMonth.push({
					weekNum: currentWeek.isoWeek(),
					hasNote: !!weekFile,
					file: weekFile
				});

				currentWeek.add(1, 'week');
			}

			const monthBlock = weeksByMonth.createEl('div', { cls: 'month-weeks-block' });
			monthBlock.createEl('div', { cls: 'month-weeks-title', text: getMonthName(monthDate).slice(0, 3) });

			const weeksContainer = monthBlock.createEl('div', { cls: 'weeks-container' });

			weeksInMonth.forEach(({weekNum, hasNote, file}) => {
				const weekBadge = weeksContainer.createEl('div', {
					cls: `week-badge ${hasNote ? 'week-with-note' : 'week-empty'}`
				});

				weekBadge.textContent = `W${weekNum.toString().padStart(2, '0')}`;

				if (hasNote && file) {
					weekBadge.onmouseenter = async () => {
						const content = await this.plugin.app.vault.read(file);
						const preview = content.slice(0, 100).replace(/[#*`]/g, '');
						weekBadge.setAttribute('data-preview', preview + (content.length > 100 ? '...' : ''));
					};

					weekBadge.onclick = () => this.plugin.app.workspace.openLinkText(file.path, '', true);
				}
			});
		}
	}

	// === ГОДЫ (отдельный вид) ===
	renderPeriodicYears(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		nav.createEl('h3', { cls: 'heatmap-year-title', text: 'Годы' });

		nav.createEl('button', { text: '◀ На 5 лет назад', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(5, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'На 5 лет вперёд ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(5, 'year');
			this.render();
		};

		const yearsGrid = wrapper.createEl('div', { cls: 'years-grid' });

		// Показываем диапазон: текущий год ± 7 лет
		for (let y = currentYear - 7; y <= currentYear + 7; y++) {
			const yearFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'year' && data.date.year() === y;
			});

			const yearCard = yearsGrid.createEl('div', {
				cls: `year-card ${yearFile ? 'year-with-note' : ''} ${y === currentYear ? 'current-year' : ''}`
			});

			yearCard.createEl('div', { cls: 'year-title', text: y.toString() });

			if (yearFile) {
				yearCard.createEl('div', { cls: 'year-badge', text: '✅ Есть' });

				yearCard.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(yearFile);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					yearCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};

				yearCard.onclick = () => this.plugin.app.workspace.openLinkText(yearFile.path, '', true);
			} else {
				yearCard.createEl('div', { cls: 'year-badge year-empty', text: '❌ Нет' });
				yearCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${y}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}
	}

	// === ОБЗОР ВСЕХ ТИПОВ ЗАМЕТОК ===
	renderMonthsOverview(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'months-overview-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const yearTitle = nav.createEl('h3', { cls: 'heatmap-year-title', text: `Обзор ${this.currentDate.year().toString()}` });

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		// === 1. ГОДОВАЯ ЗАМЕТКА ===
		const yearSection = wrapper.createEl('div', { cls: 'periodic-section' });
		yearSection.createEl('h4', { cls: 'periodic-section-title', text: '🎯 Годовая заметка' });

		const currentYear = this.currentDate.year();
		const yearFile = this.dailyNotes.find(file => {
			const data = this.getFileData(file);
			return data && data.type === 'year' && data.date.year() === currentYear;
		});

		if (yearFile) {
			const yearCard = yearSection.createEl('div', { cls: 'year-card year-with-note current-year' });
			yearCard.createEl('div', { cls: 'year-title', text: currentYear.toString() });
			yearCard.createEl('div', { cls: 'year-badge', text: '✅ Есть годовая заметка' });

			yearCard.onmouseenter = async () => {
				const content = await this.plugin.app.vault.read(yearFile);
				const preview = content.slice(0, 150).replace(/[#*`]/g, '');
				yearCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
			};
			yearCard.onclick = () => this.plugin.app.workspace.openLinkText(yearFile.path, '', true);
		} else {
			const yearCard = yearSection.createEl('div', { cls: 'year-card' });
			yearCard.createEl('div', { cls: 'year-title', text: currentYear.toString() });
			yearCard.createEl('div', { cls: 'year-badge year-empty', text: '❌ Нет годовой заметки' });
			yearCard.onclick = () => {
				const folders = this.plugin.settings.watchedFolders.split('\n');
				const path = `${folders[0].trim()}/${currentYear}.md`;
				this.createNoteIfNotExists(path);
			};
		}

		// === 2. КВАРТАЛЬНЫЕ ЗАМЕТКИ ===
		const quartersSection = wrapper.createEl('div', { cls: 'periodic-section' });
		quartersSection.createEl('h4', { cls: 'periodic-section-title', text: '📊 Квартальные заметки' });

		const quartersGrid = quartersSection.createEl('div', { cls: 'quarters-grid' });
		for (let q = 1; q <= 4; q++) {
			const quarterStart = moment().year(currentYear).quarter(q).startOf('quarter');

			const quarterFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'quarter' &&
					   data.date.year() === currentYear &&
					   data.date.quarter() === q;
			});

			const quarterCard = quartersGrid.createEl('div', {
				cls: `quarter-card ${quarterFile ? 'quarter-with-note' : ''}`
			});

			const monthsInQuarter = [];
			for (let m = 0; m < 3; m++) {
				const mDate = quarterStart.clone().add(m, 'months');
				monthsInQuarter.push(getMonthName(mDate).slice(0, 3));
			}

			quarterCard.createEl('div', { cls: 'quarter-title', text: `Q${q}` });
			quarterCard.createEl('div', { cls: 'quarter-months', text: monthsInQuarter.join(' • ') });

			if (quarterFile) {
				quarterCard.createEl('div', { cls: 'quarter-badge', text: '✅ Есть заметка' });

				quarterCard.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(quarterFile);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					quarterCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};

				quarterCard.onclick = () => this.plugin.app.workspace.openLinkText(quarterFile.path, '', true);
			} else {
				quarterCard.createEl('div', { cls: 'quarter-badge quarter-empty', text: '❌ Нет заметки' });
				quarterCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${currentYear}-Q${q}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}

		// === 3. МЕСЯЧНЫЕ ЗАМЕТКИ ===
		const monthsSection = wrapper.createEl('div', { cls: 'periodic-section' });
		monthsSection.createEl('h4', { cls: 'periodic-section-title', text: '🗓️ Месячные заметки' });

		const monthsGrid = monthsSection.createEl('div', { cls: 'periodic-months-grid' });

		for (let m = 0; m < 12; m++) {
			const monthDate = moment().year(currentYear).month(m);
			const monthFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'month' &&
					   data.date.year() === currentYear &&
					   data.date.month() === m;
			});

			const monthCard = monthsGrid.createEl('div', {
				cls: `periodic-month-card ${monthFile ? 'periodic-month-with-note' : ''}`
			});

			monthCard.createEl('div', { cls: 'periodic-month-name', text: getMonthName(monthDate).slice(0, 3) });

			if (monthFile) {
				monthCard.addClass('periodic-month-has-note');

				monthCard.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(monthFile);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					monthCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};

				monthCard.onclick = () => this.plugin.app.workspace.openLinkText(monthFile.path, '', true);
			} else {
				monthCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${monthDate.format('YYYY-MM')}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}

		// === 4. НЕДЕЛЬНЫЕ ЗАМЕТКИ ===
		const weeksSection = wrapper.createEl('div', { cls: 'periodic-section' });
		weeksSection.createEl('h4', { cls: 'periodic-section-title', text: '📆 Недельные заметки' });

		const weeksByMonth = weeksSection.createEl('div', { cls: 'weeks-by-month' });

		for (let m = 0; m < 12; m++) {
			const monthDate = moment().year(currentYear).month(m);
			const monthStart = monthDate.clone().startOf('month');
			const monthEnd = monthDate.clone().endOf('month');

			// Ищем все недельные заметки в этом месяце
			const weeksInMonth = [];
			let currentWeek = monthStart.clone().startOf('isoWeek');

			while (currentWeek.isBefore(monthEnd) || currentWeek.isSame(monthEnd, 'day')) {
				const weekFile = this.dailyNotes.find(file => {
					const data = this.getFileData(file);
					return data && data.type === 'week' &&
						   data.date.year() === currentYear &&
						   data.date.isoWeek() === currentWeek.isoWeek();
				});

				weeksInMonth.push({
					weekNum: currentWeek.isoWeek(),
					hasNote: !!weekFile,
					file: weekFile
				});

				currentWeek.add(1, 'week');
			}

			const monthBlock = weeksByMonth.createEl('div', { cls: 'month-weeks-block' });
			monthBlock.createEl('div', { cls: 'month-weeks-title', text: getMonthName(monthDate).slice(0, 3) });

			const weeksContainer = monthBlock.createEl('div', { cls: 'weeks-container' });

			weeksInMonth.forEach(({weekNum, hasNote, file}) => {
				const weekBadge = weeksContainer.createEl('div', {
					cls: `week-badge ${hasNote ? 'week-with-note' : 'week-empty'}`
				});

				weekBadge.textContent = `W${weekNum.toString().padStart(2, '0')}`;

				if (hasNote && file) {
					weekBadge.onmouseenter = async () => {
						const content = await this.plugin.app.vault.read(file);
						const preview = content.slice(0, 100).replace(/[#*`]/g, '');
						weekBadge.setAttribute('data-preview', preview + (content.length > 100 ? '...' : ''));
					};

					weekBadge.onclick = () => this.plugin.app.workspace.openLinkText(file.path, '', true);
				}
			});
		}

		// === 5. ДНЕВНЫЕ ЗАМЕТКИ (статистика по месяцам) ===
		const daysSection = wrapper.createEl('div', { cls: 'periodic-section' });
		daysSection.createEl('h4', { cls: 'periodic-section-title', text: '📅 Дневные заметки (статистика)' });

		const dayStatsGrid = daysSection.createEl('div', { cls: 'months-grid' });

		for (let month = 0; month < 12; month++) {
			const monthDate = this.currentDate.clone().month(month);
			const monthStart = monthDate.clone().startOf('month');
			const monthEnd = monthDate.clone().endOf('month');

			// Подсчитываем дневные заметки за месяц
			let dayCount = 0;
			const dayFiles: TFile[] = [];

			this.dailyNotes.forEach(file => {
				const data = this.getFileData(file);
				if (data && data.type === 'day') {
					const fileDate = data.date;
					if (fileDate.year() === currentYear && fileDate.month() === month) {
						dayCount++;
						dayFiles.push(file);
					}
				}
			});

			const monthCard = dayStatsGrid.createEl('div', { cls: 'month-card' });
			monthCard.createEl('h4', { cls: 'month-card-title', text: getMonthName(monthDate) });

			const statsDiv = monthCard.createEl('div', { cls: 'month-card-stats' });

			if (dayCount > 0) {
				monthCard.addClass('month-card-with-note');
				statsDiv.createEl('span', { cls: 'month-stat-badge month-has-note', text: `✅ ${dayCount} заметок` });

				// Показать последнюю заметку месяца
				const lastDayFile = dayFiles.sort((a, b) => {
					const dataA = this.getFileData(a);
					const dataB = this.getFileData(b);
					if (!dataA || !dataB) return 0;
					return dataB.date.valueOf() - dataA.date.valueOf();
				})[0];

				monthCard.onclick = () => this.plugin.app.workspace.openLinkText(lastDayFile.path, '', true);

				monthCard.onmouseenter = async () => {
					const content = await this.plugin.app.vault.read(lastDayFile);
					const preview = content.slice(0, 150).replace(/[#*`]/g, '');
					monthCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
				};
			} else {
				statsDiv.createEl('span', { cls: 'month-stat-badge month-no-note', text: '❌ Нет заметок' });
			}
		}
	}

	async createNoteIfNotExists(path: string) {
		if (!this.plugin.app.vault.getAbstractFileByPath(path)) {
			const folder = path.split('/').slice(0, -1).join('/');
			if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
				await this.plugin.app.vault.createFolder(folder);
			}
			await this.plugin.app.vault.create(path, '');
		}
		await this.plugin.app.workspace.openLinkText(path, '', true);
	}

	renderStatistics(container: HTMLElement) {
		const box = container.createEl('div', { cls: 'stats-container' });
		box.createEl('h3', { text: '📈 Прогресс' });

		// Подсчет заметок по типам
		const typeCounts = { day: 0, week: 0, month: 0, quarter: 0, year: 0 };
		this.dailyNotes.forEach(file => {
			const result = this.getFileData(file);
			if (result && typeCounts[result.type as keyof typeof typeCounts] !== undefined) {
				typeCounts[result.type as keyof typeof typeCounts]++;
			}
		});

		// Базовые метрики
		box.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>🔥 Текущая серия:</strong> ${this.stats.currentStreak} дн.`;
		box.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>📅 Последняя запись:</strong> ${this.stats.lastNoteDate}`;
		box.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>⏰ Прошло времени:</strong> ${this.stats.timeSinceLastNote}`;

		// Разделитель
		box.createEl('hr', { cls: 'stat-divider' });

		// Детализация по типам
		box.createEl('p', { cls: 'stat-item stat-header' }).innerHTML = '<strong>📊 Заметки по типам:</strong>';
		box.createEl('p', { cls: 'stat-item stat-type-day' }).innerHTML = `📅 Дневные: <strong>${typeCounts.day}</strong>`;
		box.createEl('p', { cls: 'stat-item stat-type-week' }).innerHTML = `📆 Недельные: <strong>${typeCounts.week}</strong>`;
		box.createEl('p', { cls: 'stat-item stat-type-month' }).innerHTML = `🗓️ Месячные: <strong>${typeCounts.month}</strong>`;
		box.createEl('p', { cls: 'stat-item stat-type-quarter' }).innerHTML = `📊 Квартальные: <strong>${typeCounts.quarter}</strong>`;
		box.createEl('p', { cls: 'stat-item stat-type-year' }).innerHTML = `🎯 Годовые: <strong>${typeCounts.year}</strong>`;

		// Всего заметок
		box.createEl('hr', { cls: 'stat-divider' });
		box.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>📝 Всего заметок:</strong> ${this.dailyNotes.length}`;

		// Процент заполнения за год
		const yearStart = moment().startOf('year');
		const yearEnd = moment().endOf('year');
		const daysInYear = yearEnd.diff(yearStart, 'days') + 1;
		const daysPassed = moment().diff(yearStart, 'days') + 1;
		const dayNotes = typeCounts.day;
		const fillPercentage = daysPassed > 0 ? Math.round((dayNotes / daysPassed) * 100) : 0;

		box.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>📈 Заполнение года:</strong> ${fillPercentage}%`;
	}

	renderRetroModule(container: HTMLElement) {
		const box = container.createEl('div', { cls: 'memory-box' });
		const head = box.createEl('div', { cls: 'retro-header' });
		head.createEl('h3', { text: '🕰 Ретро' });

		const ctrls = box.createEl('div', { cls: 'retro-controls' });
		const btnDay = ctrls.createEl('button', { cls: 'retro-btn', text: '📅 Этот день' });
		const btnRnd = ctrls.createEl('button', { cls: 'retro-btn', text: '🎲 Рандом' });

		const preview = box.createEl('div', { cls: 'memory-preview' });

		btnDay.onclick = async () => {
			const notes = getNotesOnThisDay(this.dailyNotes);
			if(notes.length) this.showPreview(notes[0], preview);
			else { preview.empty(); preview.createEl('span', { text: 'Пусто...' }); }
		};
		btnRnd.onclick = async () => {
			const note = await getRandomQualityNote(this.plugin.app, this.dailyNotes);
			if(note) this.showPreview(note, preview);
		};

		btnDay.click(); // Автозагрузка
	}

	async showPreview(file: TFile, container: HTMLElement) {
		const content = await this.plugin.app.vault.read(file);
		container.empty();

		// Заголовок с датой
		container.createEl('h4', { cls: 'preview-date', text: file.name.replace('.md', '') });

		// Полный контент заметки
		const contentEl = container.createEl('div', { cls: 'preview-content' });
		contentEl.textContent = content;

		// Кнопка открытия
		container.createEl('button', { cls: 'preview-open-button', text: '📂 Открыть в Obsidian' })
			.onclick = () => this.plugin.app.workspace.openLinkText(file.path, '', true);
	}

	async createNote(dateStr: string) {
		const folders = this.plugin.settings.watchedFolders.split('\n');
		const formats = this.plugin.settings.dateFormats.split('\n');
		// Берем первую папку и первый формат
		const path = `${folders[0].trim()}/${moment(dateStr).format(formats[0].trim())}.md`;

		if(!this.plugin.app.vault.getAbstractFileByPath(path)) {
			// Проверка папки
			const folder = folders[0].trim();
			if(!this.plugin.app.vault.getAbstractFileByPath(folder)) await this.plugin.app.vault.createFolder(folder);
			await this.plugin.app.vault.create(path, '');
		}
		await this.plugin.app.workspace.openLinkText(path, '', true);
	}
}
