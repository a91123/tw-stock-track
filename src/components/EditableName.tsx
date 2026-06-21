import { useState } from 'react'

interface Props {
  code: string
  name?: string
  onRename: (code: string, name: string) => void
}

// 點擊即可輸入/編輯股票中文名稱
export default function EditableName({ code, name, onRename }: Props) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name ?? '')

  function save() {
    onRename(code, val)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        placeholder="輸入名稱"
        className="w-20 px-1 py-0.5 text-xs font-normal border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        onClick={e => e.stopPropagation()}
      />
    )
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); setVal(name ?? ''); setEditing(true) }}
      className={`text-xs font-normal ${name ? 'text-gray-500' : 'text-blue-400'} hover:text-blue-600`}
      title="點擊編輯名稱"
    >
      {name || '＋命名'}
    </button>
  )
}
