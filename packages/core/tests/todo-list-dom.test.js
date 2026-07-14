/**
 * todo-list-dom.test.js — 16.7.3: pure DOM helpers for to-do lists.
 */
import { describe, it, expect } from 'vitest';
import {
  createTodoList, markAsTodoItem, isTodoItem, isChecked, setChecked,
  toggleChecked, normalizeTodoList,
} from '../src/plugins/todo-list/todo-list-dom.js';

describe('createTodoList', () => {
  it('builds a <ul data-todo-list> with one unchecked, EMPTY <li data-todo>', () => {
    const ul = createTodoList(document);
    expect(ul.tagName).toBe('UL');
    expect(ul.hasAttribute('data-todo-list')).toBe(true);
    const li = ul.firstElementChild;
    expect(li.tagName).toBe('LI');
    expect(isTodoItem(li)).toBe(true);
    expect(isChecked(li)).toBe(false);
    // Deliberately no placeholder <br> — insertTodoList's caller decides
    // whether to transfer real content in or add one itself.
    expect(li.childNodes.length).toBe(0);
  });
});

describe('markAsTodoItem / isTodoItem / isChecked', () => {
  it('sets data-todo, data-checked, role, aria-checked, tabIndex', () => {
    const li = document.createElement('li');
    markAsTodoItem(li, true);
    expect(li.hasAttribute('data-todo')).toBe(true);
    expect(li.getAttribute('data-checked')).toBe('true');
    expect(li.getAttribute('role')).toBe('checkbox');
    expect(li.getAttribute('aria-checked')).toBe('true');
    expect(li.tabIndex).toBe(0);
  });

  it('isTodoItem is false for a plain <li> or a non-li element', () => {
    const plain = document.createElement('li');
    expect(isTodoItem(plain)).toBe(false);
    const div = document.createElement('div');
    markAsTodoItem(div, false); // hypothetically marked, still not an <li>
    expect(isTodoItem(div)).toBe(false);
    expect(isTodoItem(null)).toBe(false);
  });
});

describe('setChecked / toggleChecked', () => {
  it('setChecked updates both data-checked and aria-checked', () => {
    const li = document.createElement('li');
    markAsTodoItem(li, false);
    setChecked(li, true);
    expect(isChecked(li)).toBe(true);
    expect(li.getAttribute('aria-checked')).toBe('true');
    setChecked(li, false);
    expect(isChecked(li)).toBe(false);
    expect(li.getAttribute('aria-checked')).toBe('false');
  });

  it('toggleChecked flips the current state', () => {
    const li = document.createElement('li');
    markAsTodoItem(li, false);
    toggleChecked(li);
    expect(isChecked(li)).toBe(true);
    toggleChecked(li);
    expect(isChecked(li)).toBe(false);
  });
});

describe('normalizeTodoList', () => {
  it('marks any li missing data-todo as a fresh unchecked item', () => {
    const ul = document.createElement('ul');
    ul.setAttribute('data-todo-list', '');
    const plainLi = document.createElement('li');
    plainLi.textContent = 'moved in via indent/outdent';
    ul.appendChild(plainLi);
    normalizeTodoList(ul);
    expect(isTodoItem(plainLi)).toBe(true);
    expect(isChecked(plainLi)).toBe(false);
  });

  it('keeps aria-checked in sync when data-checked was set directly', () => {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    markAsTodoItem(li, false);
    li.setAttribute('data-checked', 'true'); // simulate a direct DOM edit
    ul.appendChild(li);
    normalizeTodoList(ul);
    expect(li.getAttribute('aria-checked')).toBe('true');
  });

  it('does not touch non-li children', () => {
    const ul = document.createElement('ul');
    const template = document.createElement('template');
    ul.appendChild(template);
    expect(() => normalizeTodoList(ul)).not.toThrow();
  });
});
