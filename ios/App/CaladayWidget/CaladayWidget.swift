import SwiftUI
import WidgetKit

// MARK: - Difficulty (mirrors components/DifficultyBar.tsx)

struct Difficulty {
    // [solutions, fillPercent, r, g, b]
    static let referencePoints: [(Double, Double, Double, Double, Double)] = [
        (600, 95, 239, 68, 68),    // Red, mostly filled
        (1250, 67, 234, 179, 8),   // Yellow, 2/3 filled
        (3000, 33, 34, 197, 94),   // Green, 1/3 filled
        (5000, 5, 59, 130, 246),   // Blue, mostly empty
    ]

    let fillPercent: Double
    let color: Color
    let label: String

    init(solutions: Int) {
        let clamped = min(max(Double(solutions), 600), 5000)
        var lowerIdx = 0
        for i in 0..<(Self.referencePoints.count - 1) {
            if clamped >= Self.referencePoints[i].0
                && clamped <= Self.referencePoints[i + 1].0 {
                lowerIdx = i
                break
            }
        }
        let lower = Self.referencePoints[lowerIdx]
        let upper = Self.referencePoints[min(lowerIdx + 1, Self.referencePoints.count - 1)]
        let range = upper.0 - lower.0
        let t = range > 0 ? (clamped - lower.0) / range : 0

        fillPercent = lower.1 + t * (upper.1 - lower.1)
        color = Color(
            red: (lower.2 + t * (upper.2 - lower.2)) / 255,
            green: (lower.3 + t * (upper.3 - lower.3)) / 255,
            blue: (lower.4 + t * (upper.4 - lower.4)) / 255
        )

        switch solutions {
        case 3500...: label = "Easiest"
        case 2000...: label = "Easy"
        case 1250...: label = "Medium"
        default: label = "Hard"
        }
    }
}

// MARK: - Solutions cache (bundled solutions-cache.csv)

enum SolutionsCache {
    static let counts: [String: Int] = {
        guard let url = Bundle.main.url(forResource: "solutions-cache", withExtension: "csv"),
              let text = try? String(contentsOf: url, encoding: .utf8)
        else { return [:] }
        var result: [String: Int] = [:]
        for line in text.split(separator: "\n").dropFirst() {
            let parts = line.split(separator: ",")
            if parts.count >= 2, let count = Int(parts[1].trimmingCharacters(in: .whitespaces)) {
                result[String(parts[0])] = count
            }
        }
        return result
    }()

    static func count(for date: Date) -> Int? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        return counts[formatter.string(from: date)]
    }
}

// MARK: - Timeline

struct DayEntry: TimelineEntry {
    let date: Date
    let solutions: Int?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry {
        DayEntry(date: Date(), solutions: 1500)
    }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        completion(DayEntry(date: Date(), solutions: SolutionsCache.count(for: Date())))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        // One entry per day for the next week, refreshing at local midnight
        let calendar = Calendar.current
        var entries: [DayEntry] = []
        let startOfToday = calendar.startOfDay(for: Date())
        for offset in 0..<7 {
            if let day = calendar.date(byAdding: .day, value: offset, to: startOfToday) {
                let entryDate = offset == 0 ? Date() : day
                entries.append(DayEntry(date: entryDate, solutions: SolutionsCache.count(for: day)))
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - View

struct CaladayWidgetView: View {
    var entry: DayEntry

    private static let background = Color(red: 0xF2 / 255, green: 0xED / 255, blue: 0xE7 / 255)
    private static let ink = Color(red: 0x2B / 255, green: 0x2B / 255, blue: 0x23 / 255)

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(entry.date, format: .dateTime.weekday(.wide))
                .font(.caption)
                .foregroundStyle(Self.ink.opacity(0.6))
            Text(entry.date, format: .dateTime.month(.abbreviated).day())
                .font(.title2.bold())
                .foregroundStyle(Self.ink)

            Spacer(minLength: 0)

            if let solutions = entry.solutions {
                let difficulty = Difficulty(solutions: solutions)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Self.ink.opacity(0.1))
                        Capsule()
                            .fill(difficulty.color)
                            .frame(width: geo.size.width * difficulty.fillPercent / 100)
                    }
                }
                .frame(height: 6)
                Text(difficulty.label)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(difficulty.color)
            } else {
                Text("Today's puzzle awaits")
                    .font(.caption2)
                    .foregroundStyle(Self.ink.opacity(0.6))
            }
        }
        .containerBackground(Self.background, for: .widget)
    }
}

// MARK: - Widget

struct CaladayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CaladayWidget", provider: Provider()) { entry in
            CaladayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's Puzzle")
        .description("Today's date and puzzle difficulty.")
        .supportedFamilies([.systemSmall])
    }
}
