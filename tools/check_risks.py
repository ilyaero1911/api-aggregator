"""Проверить CSV-реестр и при необходимости построить SVG-матрицу."""
from __future__ import annotations

import argparse
import csv
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'docs' / 'seminar-06'


def priority(score: int) -> str:
    return 'критический' if score >= 16 else 'высокий' if score >= 10 else 'средний' if score >= 5 else 'низкий'


def load_and_check() -> list[dict[str, str]]:
    with (DIRECTORY / 'risk-register.csv').open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    required = {'id', 'category', 'risk', 'cause', 'effect', 'probability', 'impact', 'score', 'priority', 'strategy', 'owner', 'mitigation', 'trigger_1', 'trigger_2', 'trigger_3', 'task', 'due_date', 'status', 'target_probability', 'target_impact'}
    assert len(rows) >= 10, 'нужно минимум 10 рисков'
    assert required <= set(rows[0]), 'не хватает колонок'
    assert len({row['id'] for row in rows}) == len(rows), 'повтор id'
    categories = {'требования', 'сроки', 'команда', 'технологии', 'интеграции', 'данные', 'безопасность', 'эксплуатация'}
    assert categories <= {row['category'] for row in rows}, 'не покрыты категории'
    assert sum(row['category'] == 'данные' for row in rows) >= 3, 'нужно минимум 3 риска данных'
    for row in rows:
        assert all(row[key].strip() for key in required), f"{row['id']}: пустое поле"
        p, i, score = (int(row[key]) for key in ('probability', 'impact', 'score'))
        assert 1 <= p <= 5 and 1 <= i <= 5 and score == p * i, row['id']
        assert row['priority'] == priority(score), row['id']
        assert row['strategy'] in {'избежать', 'снизить', 'принять', 'передать'}, row['id']
        assert row['status'] in {'открыт', 'снижен', 'закрыт'}, row['id']
        assert len({row[f'trigger_{n}'] for n in range(1, 4)}) == 3, row['id']
        assert all(1 <= int(row[key]) <= 5 for key in ('target_probability', 'target_impact')), row['id']
        assert int(row['target_probability']) * int(row['target_impact']) <= score, row['id']
        date.fromisoformat(row['due_date'])
        if score >= 10:
            assert row['task'].startswith('https://fa.saas.sferaplatform.ru/tasks/task/ID24_API-'), row['id']
    return rows


def render(rows: list[dict[str, str]]) -> str:
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="780" viewBox="0 0 1060 780" role="img" aria-labelledby="title description">', '<title id="title">NeuroGateway — матрица рисков</title>', '<desc id="description">Пять уровней вероятности и влияния. Идентификаторы рисков расположены по исходной оценке, до выполнения мер.</desc>', '<rect width="1060" height="780" fill="#f8fafc"/>', '<g font-family="Arial, sans-serif" fill="#0f172a">', '<text x="52" y="52" font-size="27" font-weight="bold">NeuroGateway · матрица рисков</text>', '<text x="52" y="84" font-size="16">15.10.2026 · исходная экспертная оценка · S = вероятность × влияние</text>', '<text x="52" y="123" font-size="17">Вероятность ↑</text>']
    colors = {'низкий': '#dcfce7', 'средний': '#fef3c7', 'высокий': '#fed7aa', 'критический': '#fecaca'}
    for p in range(5, 0, -1):
        y = 148 + (5 - p) * 95
        parts.append(f'<text x="62" y="{y + 52}" font-size="20">{p}</text>')
        for i in range(1, 6):
            x = 100 + (i - 1) * 176
            ids = [row['id'] for row in rows if int(row['probability']) == p and int(row['impact']) == i]
            parts.append(f'<rect x="{x}" y="{y}" width="168" height="87" rx="8" fill="{colors[priority(p*i)]}"/>')
            parts.append(f'<text x="{x+12}" y="{y+23}" font-size="13" fill="#475569">S = {p*i}</text>')
            for line, start in enumerate(range(0, len(ids), 3)):
                parts.append(f'<text x="{x+12}" y="{y+49+line*20}" font-size="16" font-weight="bold">{escape(", ".join(ids[start:start+3]))}</text>')
    for i in range(1, 6):
        parts.append(f'<text x="{180+(i-1)*176}" y="651" font-size="20">{i}</text>')
    parts.append('<text x="765" y="685" font-size="17">Влияние →</text>')
    for n, (label, color) in enumerate(colors.items()):
        x = 52 + n * 245
        parts.append(f'<rect x="{x}" y="713" width="18" height="18" rx="3" fill="{color}"/><text x="{x+27}" y="728" font-size="16">{escape(label)}</text>')
    parts.append('</g></svg>\n')
    return '\n'.join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    rows = load_and_check()
    expected = render(rows)
    if args.render:
        (DIRECTORY / 'risk-matrix.svg').write_text(expected, encoding='utf-8')
    else:
        assert (DIRECTORY / 'risk-matrix.svg').read_text(encoding='utf-8') == expected, 'SVG устарел: запустите --render'
    counts = {level: sum(row['priority'] == level for row in rows) for level in ('критический', 'высокий', 'средний', 'низкий')}
    print(f'Реестр: {len(rows)} рисков, категории и связи проверены. Приоритеты: {counts}')


if __name__ == '__main__':
    main()
