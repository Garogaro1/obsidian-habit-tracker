// Названия месяцев на русском
const MONTH_NAMES = [
	'Январь',
	'Февраль',
	'Март',
	'Апрель',
	'Май',
	'Июнь',
	'Июль',
	'Август',
	'Сентябрь',
	'Октябрь',
	'Ноябрь',
	'Декабрь',
];

/**
 * Получить название месяца на русском
 */
export function getMonthName(date: moment.Moment): string {
	return MONTH_NAMES[date.month()];
}

/**
 * Сгенерировать сетку календаря для заданного месяца
 * Возвращает массив дней (null для пустых ячеек, moment.Moment для дней)
 */
export function generateCalendar(date: moment.Moment): (moment.Moment | null)[] {
	const year = date.year();
	const month = date.month();

	// Первый день месяца
	const firstDay = window.moment([year, month, 1]);

	// Последний день месяца
	const lastDay = window.moment([year, month + 1, 0]).subtract(1, 'day');

	// День недели первого дня месяца (0-6, где 0 = воскресенье)
	// В России неделя начинается с понедельника, поэтому конвертируем
	let firstDayOfWeek = firstDay.day();
	firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

	// Количество дней в месяце
	const daysInMonth = lastDay.date();

	// Создаем массив для календаря (6 недель x 7 дней = 42 ячейки)
	const calendar: (moment.Moment | null)[] = [];

	// Пустые ячейки до первого дня месяца
	for (let i = 0; i < firstDayOfWeek; i++) {
		calendar.push(null);
	}

	// Дни месяца
	for (let day = 1; day <= daysInMonth; day++) {
		calendar.push(window.moment([year, month, day]));
	}

	return calendar;
}
