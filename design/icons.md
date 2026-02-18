# Icons

> Правила для иконок в интерфейсе

---

## Философия иконок

### Принципы
- **Минимализм** - простые линейные формы
- **Киберпанк/готика** - острые углы, геометрия
- **Консистентность** - одинаковая толщина линий, стиль
- **Подсветка** - все иконки с glow эффектом

### НЕ использовать эмоджи
❌ **Запрещено:** 🎯, 💪, 💭, 🧠, 📚, 🔥, ✅, ⏳, и т.д.
✅ **Вместо этого:** кастомные SVG иконки из библиотеки

---

## Библиотека иконок

### Рекомендуемая: Lucide React Native

```bash
npm install lucide-react-native
```

**Почему Lucide:**
- Минималистичные линейные иконки
- Настраиваемые (размер, цвет, толщина линии)
- Современный киберпанк-стиль
- Большой выбор (>1000 иконок)

### Альтернативы
- **Heroicons** (если Lucide не подходит)
- **Кастомные SVG** (для уникальных иконок)

---

## Параметры иконок

### Размеры
```typescript
// ✅ Стандартные размеры
iconSize: {
  xs: 16,    // Мелкие иконки (badge, inline)
  sm: 20,    // Обычные иконки в UI
  md: 24,    // Стандартный размер (кнопки, списки)
  lg: 32,    // Крупные иконки (headers, карточки)
  xl: 48,    // Огромные иконки (empty states, splash)
}
```

### Толщина линии (Stroke Width)
```typescript
// ✅ Тонкие линии для готического стиля
strokeWidth: {
  thin: 1,      // Очень тонкие (декоративные)
  default: 1.5, // Стандарт для большинства
  medium: 2,    // Для акцентов
}
```

### Цвета
Иконки наследуют цвет от контекста:
- **Белый** (#FFFFFF) - обычные иконки
- **Голубой** (#00D9FF) - активные/акцентные
- **Зеленый** (#00FF88) - успех
- **Оранжевый** (#FF9500) - предупреждение
- **Красный** (#FF3B30) - ошибка

### Подсветка (Glow)
Все иконки с легкой подсветкой.

```typescript
// ✅ Стандартная иконка с подсветкой
import { Target } from 'lucide-react-native'

<View style={{
  shadowColor: '#FFFFFF',
  shadowOpacity: 0.3,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 0 },
}}>
  <Target
    size={24}
    color="#FFFFFF"
    strokeWidth={1.5}
  />
</View>
```

---

## Маппинг эмоджи → иконки

### Сферы и цели

| Эмоджи | Lucide Icon | Контекст |
|--------|-------------|----------|
| 🎯 | `Target` | Цель, objective |
| 🏆 | `Trophy` | Достижение, навык |
| ⭐ | `Star` | Избранное, важное |
| 📈 | `TrendingUp` | Прогресс, рост |
| 🌳 | `GitBranch` | Дерево навыков (ветки) |

### Типы нагрузки

| Эмоджи | Lucide Icon | Описание |
|--------|-------------|----------|
| 💪 | `Dumbbell` | Физическая усталость |
| 💭 | `MessageCircle` или `Cloud` | Эмоциональная усталость |
| 🧠 | `Cpu` или `Brain` | Интеллектуальная усталость |

**Примечание:** Lucide не имеет иконки Brain. Используй `Cpu` (процессор) для технологичности или создай кастомную SVG.

### Задания и квесты

| Эмоджи | Lucide Icon | Контекст |
|--------|-------------|----------|
| 🔄 | `RotateCw` | Регулярное задание |
| 📚 | `Book` или `BookOpen` | Стратегическое задание (теория) |
| ✅ | `Check` или `CheckCircle` | Выполнено |
| ⏳ | `Clock` | В процессе |
| ⬜ | `Square` | Не начато |
| 🔥 | `Flame` | Streak (непрерывность) |

### Статус и уведомления

| Эмоджи | Lucide Icon | Контекст |
|--------|-------------|----------|
| ⚠️ | `AlertTriangle` | Предупреждение |
| ❌ | `X` или `XCircle` | Ошибка, отмена |
| ℹ️ | `Info` | Информация |
| 🔔 | `Bell` | Уведомление |
| ⚙️ | `Settings` | Настройки |

### Навигация

| Эмоджи | Lucide Icon | Контекст |
|--------|-------------|----------|
| 🏠 | `Home` | Главная |
| 📅 | `Calendar` | План на день |
| 📝 | `FileText` | База знаний |
| 👤 | `User` | Профиль |
| ➕ | `Plus` | Добавить |
| ➖ | `Minus` | Удалить, уменьшить |

### Прочие

| Эмоджи | Lucide Icon | Контекст |
|--------|-------------|----------|
| 🔗 | `Link` | Связь между заметками |
| 🔍 | `Search` | Поиск |
| 💬 | `MessageSquare` | Чат с LLM |
| 📊 | `BarChart` | Статистика |
| 🎨 | `Palette` | Сфера (иконка сферы) |

---

## Примеры использования

### Иконка в кнопке
```typescript
import { Target } from 'lucide-react-native'

<Pressable style={styles.button}>
  <View style={{
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
    shadowRadius: 4,
  }}>
    <Target size={20} color="#FFFFFF" strokeWidth={1.5} />
  </View>
  <Text>Создать цель</Text>
</Pressable>
```

### Иконка в списке заданий
```typescript
import { RotateCw, Book } from 'lucide-react-native'

const TaskIcon = task.type === 'regular' ? RotateCw : Book

<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
  <View style={{
    shadowColor: '#00D9FF',
    shadowOpacity: 0.4,
    shadowRadius: 6,
  }}>
    <TaskIcon size={24} color="#00D9FF" strokeWidth={1.5} />
  </View>
  <Text>{task.title}</Text>
</View>
```

### Индикатор усталости
```typescript
import { Dumbbell, MessageCircle, Cpu } from 'lucide-react-native'

const FatigueIcons = {
  physical: Dumbbell,
  emotional: MessageCircle,
  intellectual: Cpu,
}

const Icon = FatigueIcons[fatigueType]
const color = getFatigueColor(level)

<View style={{
  shadowColor: color,
  shadowOpacity: 0.6,
  shadowRadius: 6,
}}>
  <Icon size={20} color={color} strokeWidth={1.5} />
</View>
```

### Статус задания
```typescript
import { Check, Clock, Square } from 'lucide-react-native'

const StatusIcon = {
  completed: Check,
  in_progress: Clock,
  not_started: Square,
}[status]

const StatusColor = {
  completed: '#00FF88',
  in_progress: '#00D9FF',
  not_started: '#FFFFFF',
}[status]

<View style={{
  shadowColor: StatusColor,
  shadowOpacity: 0.4,
  shadowRadius: 6,
}}>
  <StatusIcon size={18} color={StatusColor} strokeWidth={1.5} />
</View>
```

### Streak индикатор
```typescript
import { Flame } from 'lucide-react-native'

<View style={{
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  borderWidth: 1,
  borderColor: '#FF9500',
  borderRadius: 0,
  paddingHorizontal: 8,
  paddingVertical: 4,
  shadowColor: '#FF9500',
  shadowOpacity: 0.4,
  shadowRadius: 6,
}}>
  <Flame size={16} color="#FF9500" strokeWidth={1.5} />
  <Text style={{
    fontFamily: 'Orbitron-Medium',
    fontSize: 14,
    color: '#FF9500',
  }}>
    {streakDays} дней
  </Text>
</View>
```

---

## Кастомные SVG иконки

Если Lucide не имеет нужной иконки, создай кастомную SVG.

### Пример: Brain Icon (Мозг/чип для интеллектуальной усталости)

```typescript
import Svg, { Path } from 'react-native-svg'

const BrainIcon = ({ size = 24, color = '#FFFFFF', strokeWidth = 1.5 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3L4 7v6c0 5 4 8 8 10 4-2 8-5 8-10V7l-8-4z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
    <Path
      d="M12 12h4M12 12h-4M12 12v4M12 12V8"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
    />
  </Svg>
)

// Использование с подсветкой
<View style={{
  shadowColor: '#00D9FF',
  shadowOpacity: 0.6,
  shadowRadius: 6,
}}>
  <BrainIcon size={24} color="#00D9FF" strokeWidth={1.5} />
</View>
```

### Правила для кастомных SVG
- **Stroke-based** (линии, не заливка)
- **Квадратные углы** (`strokeLinecap="square"`, `strokeLinejoin="miter"`)
- **ViewBox 24x24** (для консистентности)
- **Параметры:** size, color, strokeWidth
- **Простые формы** (геометрия, минимализм)

---

## Состояния иконок

### Active (Активная)
```typescript
// ✅ Голубая подсветка
<Icon
  size={24}
  color="#00D9FF"
  strokeWidth={1.5}
  style={{
    shadowColor: '#00D9FF',
    shadowOpacity: 0.6,
    shadowRadius: 8,
  }}
/>
```

### Inactive (Неактивная)
```typescript
// ✅ Белая с легкой подсветкой
<Icon
  size={24}
  color="#FFFFFF"
  strokeWidth={1.5}
  style={{
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.2,
    shadowRadius: 4,
  }}
/>
```

### Disabled (Отключенная)
```typescript
// ✅ Затухшая, без подсветки
<Icon
  size={24}
  color="#4A5568"
  strokeWidth={1.5}
  style={{ opacity: 0.4 }}
  // БЕЗ shadow
/>
```

---

## Размещение иконок

### Иконка + текст (горизонтально)
```typescript
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
  <Icon size={20} color="#FFFFFF" />
  <Text>Текст</Text>
</View>
```

### Иконка над текстом (вертикально)
```typescript
<View style={{ alignItems: 'center', gap: 4 }}>
  <Icon size={32} color="#FFFFFF" />
  <Text>Текст</Text>
</View>
```

### Иконка в круглом контейнере (опционально)
```typescript
// ✅ НО без скругления - квадратный контейнер
<View style={{
  width: 48,
  height: 48,
  borderWidth: 1,
  borderColor: '#FFFFFF',
  borderRadius: 0, // Квадратный
  justifyContent: 'center',
  alignItems: 'center',
  shadowColor: '#FFFFFF',
  shadowOpacity: 0.3,
  shadowRadius: 8,
}}>
  <Icon size={24} color="#FFFFFF" />
</View>
```

---

## Правила для иконок

### ✅ Всегда
- Используй Lucide для стандартных иконок
- Кастомные SVG для уникальных (мозг, специфичные символы)
- Подсветка (shadow) на всех иконках
- Тонкие линии (strokeWidth 1-2)
- Консистентность размеров (16/20/24/32/48)

### ❌ Никогда
- Эмоджи в интерфейсе
- Разные стили иконок в одном UI (только Lucide + кастомные SVG в едином стиле)
- Иконки с заливкой (fill) вместо stroke
- Скругленные формы для иконок (только sharp angles)

---

_Иконки = минимализм + подсветка. Замени все эмоджи в сценариях на иконки при разработке._
