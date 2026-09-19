import { describe, expect, it } from 'vitest'
import type { BackupCase } from './model'
import { plansToCsv } from './planCsv'

const plan = (id: string, patch: Partial<BackupCase> = {}): BackupCase => ({
  id,
  level: 'station',
  voltageKv: 13.8,
  main: { no: '7001', loadA: 320 },
  backups: [{ no: '7002', loadA: 270 }, { no: '7003', loadA: 285 }],
  ...patch,
})

describe('backup plans as a file', () => {
  it('says which cases were made for a presentation, in a column of their own', () => {
    const [header, real, demo] = plansToCsv([plan('a', { note: 'x' }), plan('b', { demo: true })], { ratingA: 400 }, 0.87)
      .trim()
      .split(/\r?\n/)
      .map((line) => line.replace(/^﻿/, '').split(','))
    const column = header.indexOf('demo')
    expect(column).toBe(header.indexOf('note') - 1)
    expect([real[column], real[column + 1]]).toEqual(['', 'x'])
    expect([demo[column], demo[column + 1]]).toEqual(['yes', ''])
  })
})
