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


import struct
from closure_taker import ClosureTaker
from dumper import Dumper
from fontTools.ttLib import TTFont


def dump_closure_map(fontfile, outputfolder):
  """Takes closure of each glyph in the font and dump them into the two seperate files.

  Index file used to locate a glyph in data file.
  Data file contains closure lists
  """

  font = TTFont(fontfile)
  closurer = ClosureTaker(font)

  glyph_metadata = Dumper(outputfolder + '/closure_idx')
  glyph_data = Dumper(outputfolder + '/closure_data')
  bigEndian = '>'
  fmt_offset = '>l'  # offset - length
  fmt_size = '>H'
  fmt_elem = 'H'
  elem_size = struct.calcsize(fmt_elem)
  offset = 0
  for g in font.getGlyphOrder():
    closurer.clear()
    closurer.add_glyph_names([g])
    glyphsClosure = closurer.closure()
    id = closurer.glyph_name_to_id[g]
    if len(glyphsClosure) == 1 and id in glyphsClosure:
      # recording not needed
      glyph_metadata.dump_fmt(-1, fmt_offset)
      glyph_metadata.dump_fmt(0, fmt_size)
    else:
      size = elem_size * len(glyphsClosure)
      glyph_data.dump_array(glyphsClosure, fmt_elem, bigEndian)
      glyph_metadata.dump_fmt(offset, fmt_offset)
      glyph_metadata.dump_fmt(size, fmt_size)
      #print id, g, glyphsClosure
      offset += size

  font.close()
  glyph_data.close()
  glyph_metadata.close()
