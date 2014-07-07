"""
  Copyright 2014 Google Inc. All rights reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
"""

import array
from datetime import datetime
import logging
import sys
import struct
import json as JSON
from os import path
import cStringIO
from gzip import GzipFile



last_time = None


def elapsed_time(msg, new_start=False):
  global last_time
  this_time = datetime.now()
  if last_time == None:
    logging.getLogger().setLevel(logging.INFO)
    last_time = this_time
  if new_start:
    last_time = this_time
  if this_time > last_time:
    logging.info('{0} took {1} seconds'.format(msg, this_time - last_time))
  else:
    logging.info(msg)
  last_time = this_time


def _parse_json(data):
  return JSON.loads(data)


def _parse_array_from_str(data, type, byteorder):
  """Using array.fromstring function , parses given binary string and type Returns array of type

  """
  arr = array.array(type)
  arr.fromstring(data)
  if sys.byteorder != byteorder:
    arr.byteswap()
  return arr


def _parse_array_from_file(filename, type, byteorder):
  """Using _parse_array_from_str, open given filename and parses it Returns array of type

  """
  file = open(filename, 'rb')
  arr = _parse_array_from_str(file.read(), type, byteorder)
  file.close()
  return arr


def _parse_array_fmt(fmt, count, data):
  """Using struct.unpack_from, parses given binary string as array if given fmt
  """
  pos = 0
  fmt_size = struct.calcsize(fmt)
  rv = [None] * count
  for i in xrange(count):
    rv[i] = struct.unpack_from(fmt, data, pos)
    pos += fmt_size
  return rv


def _build_cmap(cp_file, gid_file):
  """Build cmap dictionary from codepoints to glyph ids using given files
  """
  keys = _parse_array_from_file(cp_file, 'H', 'big')
  gids = _parse_array_from_file(gid_file, 'H', 'big')
  cmap = dict.fromkeys(keys)

  for i, key in enumerate(keys):
    cmap[key] = gids[i]
  return cmap



def _parse_glyf_table(file_bytes):
  """Parses given file as glyf table, where each entry is such tuples 
  (glyph id, [hmtx lsb], [vmtx tsb], offset, size)
  """
  fmt_GlyphTable = '>HH'
  HAS_HMTX = (1 << 0)
  HAS_VMTX = (1 << 1)
  HAS_CFF = (1 << 2)
  header_size = struct.calcsize(fmt_GlyphTable)

  header = buffer(file_bytes[0:header_size])
  (flags, numGlyphs) = struct.unpack(fmt_GlyphTable, header)
  deltaOffset = -1
  if flags & HAS_CFF:
    fmt_delta_size = struct.calcsize('>L')
    deltaOffset = struct.unpack('>L', file_bytes[header_size:header_size+fmt_delta_size])[0]
    header_size += fmt_delta_size
  fmt_mtx = ''
  if flags & HAS_HMTX: fmt_mtx+='h'
  if flags & HAS_VMTX: fmt_mtx+='h'
  fmt_entry = '>H' + fmt_mtx + 'LH'
  file_data = buffer(file_bytes[header_size:])
  return \
    _parse_array_fmt(fmt_entry, numGlyphs, file_data), flags & HAS_HMTX, \
    flags & HAS_VMTX, flags & HAS_CFF, deltaOffset,header_size, struct.calcsize(fmt_entry)



def _read_region(file, offset, size):
  prev = file.tell()
  file.seek(offset)
  data = file.read(size)
  file.seek(prev)
  return data


def _gzip(input):
  buffer = cStringIO.StringIO()
  f = GzipFile(fileobj=buffer, mode='wb')
  f.write(input)
  f.close()
  compressed = buffer.getvalue()
  buffer.close()
  return compressed


def prepare_bundle(request):
  """Parse requests, then prepares response bundle for glyphs
  """
  glyph_request = _parse_json(request.body)
  font = glyph_request['font']
  codepoints = glyph_request['arr']
  elapsed_time('prepare_bundle for {0} characters'.format(len(codepoints)), True)
  base = path.dirname(path.abspath(__file__)) + '/data/' + font + '/'
  cmap = _build_cmap(base + 'codepoints', base + '/gids')
  closure_reader = ClosureReader(base + '/closure_idx', base + '/closure_data')
  gids = set()
  for code in codepoints:
    if code in cmap:
      gids.update(closure_reader.read(cmap[code]))
  closure_reader.close()

  elapsed_time('gather glyph info')

  table = open(base + '/glyph_table', 'rb')
  table_bytes = bytearray(table.read())
  elapsed_time('read glyph table ({0} bytes)'.format(len(table_bytes)))
  
  data = open(base + '/glyph_data', 'rb')
  data_bytes = bytearray(data.read())
  elapsed_time('read glyph data ({0} bytes)'.format(len(data_bytes)))

  (glyf_table, has_hmtx, has_vmtx, has_cff, delta_offset,header_size, entry_size ) = \
  _parse_glyf_table(table_bytes)
  mtx_count = has_hmtx + has_vmtx
  flag_mtx = has_hmtx | has_vmtx << 1  | has_cff
  elapsed_time('open & parse glyph table')

  bundle_header = struct.pack('>HB', len(gids), flag_mtx)
  bundle_length = len(bundle_header)
  bundle_length += len(gids) * entry_size
  for id in gids:
    bundle_length += glyf_table[id][mtx_count + 2]
  bundle_bytes = bytearray(bundle_length)
  bundle_pos = 0
  length = len(bundle_header)
  bundle_bytes[bundle_pos:bundle_pos+length] = bundle_header
  bundle_pos += length
  elapsed_time('calc bundle length')

  # Copy in the data from table_bytes and data_bytes
  for id in gids:
    entry_offset = header_size + id * entry_size
    bundle_bytes[bundle_pos:bundle_pos + entry_size] = \
        table_bytes[entry_offset:entry_offset + entry_size]
    bundle_pos += entry_size

    data_offset = glyf_table[id][mtx_count + 1] - delta_offset - 1
    data_size = glyf_table[id][mtx_count + 2]
    bundle_bytes[bundle_pos:bundle_pos + data_size] = \
        data_bytes[data_offset:data_offset + data_size]
    bundle_pos += data_size
  elapsed_time('build bundle')

  table.close()
  data.close()
  elapsed_time('close files')
  result = _gzip(str(bundle_bytes))
  elapsed_time('compress request')
  return result


class ClosureReader(object):
  """Class to read closure list of a given glyph id Init with serialized closure files

  """
  fmt_idx = '>lH'
  fmt_idx_len = struct.calcsize(fmt_idx)
  fmt_one = 'H'
  fmt_one_len = struct.calcsize(fmt_one)

  def __init__(self, index_file, data_file):
    self.idx = open(index_file, 'rb')
    self.data_file = open(data_file, 'rb')

  def read(self, glyphID):
    """Return closure list of glyph ids for given glyphID
    """
    closure_set = set([glyphID])
    idx_offset = glyphID * ClosureReader.fmt_idx_len
    self.idx.seek(idx_offset)
    (offset, size) = struct.unpack(
        ClosureReader.fmt_idx,
        self.idx.read(ClosureReader.fmt_idx_len))
    if offset == -1: return closure_set
    self.data_file.seek(offset)
    arr = (
        _parse_array_from_str(
            self.data_file.read(size),
            ClosureReader.fmt_one, 'big'))
    closure_set.update(arr)
    return closure_set

  def close(self):
    self.idx.close()
    self.data_file.close()
