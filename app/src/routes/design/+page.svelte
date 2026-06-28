<script lang="ts">
	// Sample data
	const statuses = ['Черновик', 'На согласовании', 'Подтверждён', 'В работе', 'Выезд', 'Завершён', 'Отменён'];
	const formats = [
		{ name: 'банкет',    class: 'bg-purple-100 text-purple-700' },
		{ name: 'фуршет',   class: 'bg-blue-100 text-blue-700' },
		{ name: 'кофе-брейк', class: 'bg-amber-100 text-amber-700' },
		{ name: 'коктейль', class: 'bg-pink-100 text-pink-700' },
		{ name: 'буфет',    class: 'bg-green-100 text-green-700' },
	];


	const colors = {
		'Brand': ['50','100','200','300','400','500','600','700','800','900'],
		'Gray':  ['50','100','200','300','400','500','600','700','800','900'],
	};

	function brandBg(level: string) {
		const shades: Record<string, string> = {
			'50':'#eff6ff','100':'#dbeafe','200':'#bfdbfe','300':'#93c5fd','400':'#60a5fa',
			'500':'#3b82f6','600':'#2563eb','700':'#1d4ed8','800':'#1e40af','900':'#1e3a8a'
		};
		return shades[level] || '#ccc';
	}

	function grayBg(level: string) {
		const shades: Record<string, string> = {
			'50':'#f8fafc','100':'#f1f5f9','200':'#e2e8f0','300':'#cbd5e1','400':'#94a3b8',
			'500':'#64748b','600':'#475569','700':'#334155','800':'#1e293b','900':'#0f172a'
		};
		return shades[level] || '#ccc';
	}
</script>

<div class="mx-auto max-w-6xl p-6">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-gray-900">🎨 Дизайн-система Catering CRM</h1>
			<p class="text-gray-500">Все компоненты, цвета и типографика в одном месте</p>
		</div>
		<a href="/" class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 no-underline">← Назад</a>
	</div>

	<!-- ============================================ -->
	<!-- TYPOGRAPHY -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">📝 Типографика</h2>
		<div class="space-y-4">
			<div class="flex items-baseline gap-4"><span class="w-16 text-xs text-gray-400">3xl / 30px</span><p class="text-3xl font-bold text-gray-900">Заголовок страницы</p></div>
			<div class="flex items-baseline gap-4"><span class="w-16 text-xs text-gray-400">2xl / 24px</span><p class="text-2xl font-bold text-gray-900">Заголовок раздела</p></div>
			<div class="flex items-baseline gap-4"><span class="w-16 text-xs text-gray-400">xl / 20px</span><p class="text-xl font-semibold text-gray-800">Подзаголовок</p></div>
			<div class="flex items-baseline gap-4"><span class="w-16 text-xs text-gray-400">base / 15px</span><p class="text-base text-gray-700">Основной текст. Используется в формах, карточках, описаниях. Межстрочный интервал 1.5 для лучшей читаемости.</p></div>
			<div class="flex items-baseline gap-4"><span class="w-16 text-xs text-gray-400">sm / 13px</span><p class="text-sm text-gray-600">Второстепенный текст. Лейблы полей, подсказки, мета-информация.</p></div>
			<div class="flex items-baseline gap-4"><span class="w-16 text-xs text-gray-400">xs / 12px</span><p class="text-xs text-gray-500">Мелкий текст. Дата в карточке, счётчики, технические надписи.</p></div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- COLOR PALETTE -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">🎨 Цвета</h2>

		<h3 class="mb-3 text-sm font-semibold text-gray-500">Brand (Синий)</h3>
		<div class="mb-6 flex gap-1">
			{#each colors.Brand as level}
				<div class="flex h-16 flex-1 items-end justify-center rounded-lg pb-1" style="background: {brandBg(level)}">
					<span class="text-[10px] font-medium {Number(level) > 400 ? 'text-white' : 'text-gray-700'}">{level}</span>
				</div>
			{/each}
		</div>

		<h3 class="mb-3 text-sm font-semibold text-gray-500">Neutral (Серый)</h3>
		<div class="mb-6 flex gap-1">
			{#each colors.Gray as level}
				<div class="flex h-16 flex-1 items-end justify-center rounded-lg pb-1" style="background: {grayBg(level)}">
					<span class="text-[10px] font-medium {Number(level) > 400 ? 'text-white' : 'text-gray-700'}">{level}</span>
				</div>
			{/each}
		</div>

		<h3 class="mb-3 text-sm font-semibold text-gray-500">Семантические</h3>
		<div class="flex gap-3">
			<div class="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2"><span class="h-4 w-4 rounded bg-green-500"></span><span class="text-sm text-green-700">Success</span></div>
			<div class="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2"><span class="h-4 w-4 rounded bg-red-500"></span><span class="text-sm text-red-700">Danger</span></div>
			<div class="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2"><span class="h-4 w-4 rounded bg-amber-500"></span><span class="text-sm text-amber-700">Warning</span></div>
			<div class="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2"><span class="h-4 w-4 rounded bg-blue-500"></span><span class="text-sm text-blue-700">Info</span></div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- BUTTONS -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">🔘 Кнопки</h2>
		<div class="flex flex-wrap items-end gap-4">
			<div class="text-center">
				<button class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Primary</button>
				<p class="mt-1 text-xs text-gray-400">Основное действие</p>
			</div>
			<div class="text-center">
				<button class="rounded-lg bg-white border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Secondary</button>
				<p class="mt-1 text-xs text-gray-400">Второстепенное</p>
			</div>
			<div class="text-center">
				<button class="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700">Danger</button>
				<p class="mt-1 text-xs text-gray-400">Удаление / отмена</p>
			</div>
			<div class="text-center">
				<button class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white opacity-50 cursor-not-allowed">Disabled</button>
				<p class="mt-1 text-xs text-gray-400">Заблокирована</p>
			</div>
			<div class="text-center">
				<button class="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700">Ghost</button>
				<p class="mt-1 text-xs text-gray-400">Незаметная (шапка)</p>
			</div>
		</div>

		<h3 class="mt-6 mb-3 text-sm font-semibold text-gray-500">Размеры</h3>
		<div class="flex flex-wrap items-end gap-3">
			<button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">xs</button>
			<button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">sm (основной)</button>
			<button class="rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white">base</button>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- FORM INPUTS -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">📋 Поля ввода</h2>
		<div class="grid grid-cols-2 gap-6">
			<div>
				<label for="ds-text" class="mb-1 block text-sm font-medium text-gray-600">Text input</label>
				<input id="ds-text" type="text" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" placeholder="Введите значение..." />
			</div>
			<div>
				<label for="ds-email" class="mb-1 block text-sm font-medium text-gray-600">Email</label>
				<input id="ds-email" type="email" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" placeholder="client@company.ru" />
			</div>
			<div>
				<label for="ds-date" class="mb-1 block text-sm font-medium text-gray-600">Date</label>
				<input id="ds-date" type="date" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
			</div>
			<div>
				<label for="ds-time" class="mb-1 block text-sm font-medium text-gray-600">Time</label>
				<input id="ds-time" type="time" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
			</div>
			<div>
				<label for="ds-num" class="mb-1 block text-sm font-medium text-gray-600">Number</label>
				<input id="ds-num" type="number" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" placeholder="0" min="1" />
			</div>
			<div>
				<label for="ds-select" class="mb-1 block text-sm font-medium text-gray-600">Select</label>
				<select id="ds-select" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none">
					<option>— Выберите —</option>
					<option>банкет</option>
					<option>фуршет</option>
					<option>кофе-брейк</option>
				</select>
			</div>
			<div class="col-span-2">
				<label for="ds-textarea" class="mb-1 block text-sm font-medium text-gray-600">Textarea</label>
				<textarea id="ds-textarea" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" rows="3" placeholder="Комментарий..."></textarea>
			</div>
			<div>
				<label for="ds-error" class="mb-1 block text-sm font-medium text-gray-600">С ошибкой</label>
				<input id="ds-error" type="text" class="w-full rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none" value="Неверное значение" />
				<p class="mt-1 text-xs text-red-500">Это поле обязательно</p>
			</div>
			<div>
				<label for="ds-disabled" class="mb-1 block text-sm font-medium text-gray-600">Disabled</label>
				<input id="ds-disabled" type="text" class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400" disabled value="Не редактируется" />
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- TAGS & BADGES -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">🏷️ Теги и бейджи</h2>

		<h3 class="mb-3 text-sm font-semibold text-gray-500">Теги форматов</h3>
		<div class="mb-6 flex flex-wrap gap-2">
			{#each formats as f}
				<span class="rounded-full px-3 py-1 text-xs font-medium {f.class}">{f.name}</span>
			{/each}
			<span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">другое</span>
		</div>

		<h3 class="mb-3 text-sm font-semibold text-gray-500">Бейджи статусов</h3>
		<div class="flex flex-wrap gap-2">
			{#each statuses as s}
				<span class="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">{s}</span>
			{/each}
		</div>

		<h3 class="mt-6 mb-3 text-sm font-semibold text-gray-500">Индикатор срочности</h3>
		<div class="flex items-center gap-4">
			<span class="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">⚡ Срочно</span>
			<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">⏳ Завтра</span>
			<span class="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">✓ Нормально</span>
		</div>

		<h3 class="mt-6 mb-3 text-sm font-semibold text-gray-500">Аватар менеджера (инициалы)</h3>
		<div class="flex items-center gap-3">
			<span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">ИИ</span>
			<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-600">АП</span>
			<span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-600">МС</span>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- CARDS -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">🃏 Карточки</h2>

		<h3 class="mb-3 text-sm font-semibold text-gray-500">Мини-карточка (канбан)</h3>
		<div class="w-72 rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-100">
			<div class="flex items-start justify-between gap-2">
				<span class="font-medium text-gray-800 text-sm">ООО «Ромашка»</span>
				<span class="text-red-500 text-xs">⚡</span>
			</div>
			<p class="mt-1 text-xs text-gray-500">Иванов Иван</p>
			<div class="mt-2 flex flex-wrap items-center gap-1.5">
				<span class="text-xs text-gray-500">28.06.2026 14:00</span>
				<span class="text-xs text-gray-400">· 50 чел.</span>
			</div>
			<div class="mt-2 flex items-center justify-between">
				<span class="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">банкет</span>
				<div class="flex items-center gap-2">
					<span class="text-xs font-medium text-gray-700">150 000 ₽</span>
					<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">ИИ</span>
				</div>
			</div>
		</div>

		<h3 class="mt-8 mb-3 text-sm font-semibold text-gray-500">Секция формы (карточка заказа)</h3>
		<div class="max-w-lg rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<h4 class="mb-3 text-sm font-semibold text-gray-700">2. Основные параметры</h4>
			<div class="grid grid-cols-3 gap-3">
				<div><label for="ds-card-date" class="text-xs text-gray-500">Дата мероприятия</label><input id="ds-card-date" type="date" class="mt-0.5 w-full rounded border px-2 py-1.5 text-sm" /></div>
				<div><label for="ds-card-format" class="text-xs text-gray-500">Формат</label><input id="ds-card-format" class="mt-0.5 w-full rounded border px-2 py-1.5 text-sm" /></div>
				<div><label for="ds-card-guests" class="text-xs text-gray-500">Гостей</label><input id="ds-card-guests" type="number" class="mt-0.5 w-full rounded border px-2 py-1.5 text-sm" /></div>
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- KANBAN COLUMN -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">📊 Колонка канбана</h2>
		<div class="w-72 rounded-lg bg-gray-100 p-3">
			<div class="mb-3 flex items-center justify-between">
				<span class="font-medium text-gray-700 text-sm">Подтверждён</span>
				<div class="text-right">
					<span class="rounded-full bg-gray-300 px-2 py-0.5 text-xs font-bold text-gray-600">3</span>
					<div class="mt-0.5 text-xs text-gray-500">285 000 ₽</div>
				</div>
			</div>
			<div class="space-y-2">
				<!-- Empty state -->
				<p class="py-4 text-center text-xs text-gray-400">Нет заказов</p>
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- ALERTS -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">💬 Уведомления</h2>
		<div class="space-y-3">
			<div class="rounded-lg bg-red-50 p-3 text-sm text-red-600">❌ Ошибка: не удалось сохранить заказ. Проверьте соединение.</div>
			<div class="rounded-lg bg-green-50 p-3 text-sm text-green-600">✅ Сохранено</div>
			<div class="rounded-lg bg-amber-50 p-3 text-sm text-amber-600">⚠️ Дата мероприятия раньше текущей</div>
			<div class="rounded-lg bg-blue-50 p-3 text-sm text-blue-600">ℹ️ Форма отправлена клиенту. Ожидается заполнение.</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- FILE UPLOAD -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">📎 Загрузка файлов</h2>
		<div class="max-w-md">
			<label for="ds-file" class="mb-1 block text-sm font-medium text-gray-600">Прикрепить файл</label>
			<input id="ds-file" type="file" class="text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100" accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx" />
			<p class="mt-1 text-xs text-gray-400">JPEG, PNG, PDF, DOCX, XLSX — до 10 МБ</p>

			<h4 class="mt-4 mb-2 text-xs font-semibold text-gray-500">Список файлов</h4>
			<div class="space-y-1">
				<div class="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
					<span class="text-blue-600 truncate flex-1">меню_банкет.pdf</span>
					<span class="mx-2 text-xs text-gray-400">245 KB</span>
					<button class="text-xs text-red-500 hover:text-red-700">✕</button>
				</div>
				<div class="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
					<span class="text-blue-600 truncate flex-1">план_зала.jpg</span>
					<span class="mx-2 text-xs text-gray-400">1.2 MB</span>
					<button class="text-xs text-red-500 hover:text-red-700">✕</button>
				</div>
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- SHADOWS -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">🔲 Тени</h2>
		<div class="grid grid-cols-5 gap-4">
			<div class="flex h-20 items-center justify-center rounded-lg bg-white text-xs text-gray-400" style="box-shadow: var(--shadow-xs)">xs</div>
			<div class="flex h-20 items-center justify-center rounded-lg bg-white text-xs text-gray-400" style="box-shadow: var(--shadow-sm)">sm</div>
			<div class="flex h-20 items-center justify-center rounded-lg bg-white text-xs text-gray-400" style="box-shadow: var(--shadow-md)">md</div>
			<div class="flex h-20 items-center justify-center rounded-lg bg-white text-xs text-gray-400" style="box-shadow: var(--shadow-lg)">lg</div>
			<div class="flex h-20 items-center justify-center rounded-lg bg-white text-xs text-gray-400" style="box-shadow: var(--shadow-xl)">xl</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- RADIUS -->
	<!-- ============================================ -->
	<section class="mb-12 rounded-2xl bg-white p-8 shadow-sm">
		<h2 class="mb-6 text-xl font-bold text-gray-800">⭕ Скругления</h2>
		<div class="flex items-end gap-4">
			<div class="text-center"><div class="h-12 w-12 bg-blue-500" style="border-radius: var(--radius-sm)"></div><span class="mt-1 text-xs text-gray-400">sm</span></div>
			<div class="text-center"><div class="h-12 w-12 bg-blue-500" style="border-radius: var(--radius-md)"></div><span class="mt-1 text-xs text-gray-400">md</span></div>
			<div class="text-center"><div class="h-12 w-12 bg-blue-500" style="border-radius: var(--radius-lg)"></div><span class="mt-1 text-xs text-gray-400">lg</span></div>
			<div class="text-center"><div class="h-12 w-12 bg-blue-500" style="border-radius: var(--radius-xl)"></div><span class="mt-1 text-xs text-gray-400">xl</span></div>
			<div class="text-center"><div class="h-12 w-12 bg-blue-500" style="border-radius: var(--radius-full)"></div><span class="mt-1 text-xs text-gray-400">full</span></div>
		</div>
	</section>
</div>
