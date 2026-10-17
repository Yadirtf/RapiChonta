import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('lee comillas, comas y saltos de línea dentro de comillas y el BOM de Excel', () => {
    const rows = parseCsv('﻿Nombre,Descripcion,Precio\r\n"Pizza ""grande""","Jamón, piña\ny queso",32000\r\n\r\nGaseosa,,3500\n');
    expect(rows).toEqual([
      { nombre: 'Pizza "grande"', descripcion: 'Jamón, piña\ny queso', precio: '32000' },
      { nombre: 'Gaseosa', descripcion: '', precio: '3500' },
    ]);
  });

  it('usa punto y coma cuando el encabezado no tiene comas (Excel en español)', () => {
    expect(parseCsv('nombre;area\nTienda;"-76.1 1.0, -76.0 1.0"')).toEqual([{ nombre: 'Tienda', area: '-76.1 1.0, -76.0 1.0' }]);
  });
});
