import { FeeSettings } from '../utils/fees'

interface Props {
  settings: FeeSettings
  onChange: (s: FeeSettings) => void
}

const DISCOUNT_OPTIONS: { label: string; value: number }[] = [
  { label: '無折扣', value: 1 },
  { label: '8 折', value: 0.8 },
  { label: '6.5 折', value: 0.65 },
  { label: '6 折', value: 0.6 },
  { label: '5 折', value: 0.5 },
  { label: '3.8 折', value: 0.38 },
  { label: '2.8 折', value: 0.28 },
]

export default function FeeSettingsBar({ settings, onChange }: Props) {
  return (
    <div className="bg-white rounded-xl px-5 py-3 shadow-sm border border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={e => onChange({ ...settings, enabled: e.target.checked })}
          className="w-4 h-4 accent-blue-600"
        />
        <span className="text-sm font-medium text-gray-700">計算手續費與證交稅</span>
      </label>

      {settings.enabled && (
        <label className="flex items-center gap-2">
          <span className="text-xs text-gray-500">手續費折扣</span>
          <select
            value={settings.discount}
            onChange={e => onChange({ ...settings, discount: Number(e.target.value) })}
            className="px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {DISCOUNT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}

      <span className="text-xs text-gray-400 basis-full sm:basis-auto">
        手續費 0.1425%（最低 20 元）、賣出證交稅 0.3%（ETF 0.1%）。切換後所有損益重新計算。
      </span>
    </div>
  )
}
