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


def build_dict_name_id(font):
  """Build glyphName to glyphId and vice versa dictionaries dicts[0] is name to id dicts[1] is id to name

  """
  glyphs = font.getGlyphOrder()
  dicts = ({}, {})
  isCff = 'CFF ' in font
  if isCff:
    for id, name in enumerate(glyphs):
      dicts[0][name] = id
      dicts[1][id] = name
  else:
    for name in glyphs:
      id = font.getGlyphID(name)
      dicts[0][name] = id
      dicts[1][id] = name
  return dicts


def reverse_cmap(font):
  """Build reverse cmap table for unicode Returns dict from name to unicode points

  """
  cmap = font['cmap'].getcmap(3, 1)
  if cmap:
    return {v: k for k, v in cmap.cmap.iteritems()}
  else:
    raise Exception('Requires Unicode table')
