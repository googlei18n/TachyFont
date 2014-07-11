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
from _struct import pack
from __builtin__ import bytearray
import sys

"""RLE The absolute worst case should be the original length plus a copy_op and 8 byte length.

RLE operands
1100-00nn copy, nn is the # of bytes in length
1100-10nn byte fill, nn is the # of bytes in repeat count, 1 byte fill value

Where nn is:
  00 1 byte length
  01 2 byte length
  10 4 byte length
  11 8 byte length
"""

OPERATORS = {'copy': 0b11000000,  # copy operation
             'fill': 0b11001000  # value fill
            }
LOGARITHM_BASE2 = {1: 0, 2: 1, 4: 2, 8: 3}


def how_many_bytes(size):
  if size < 0x100:
    count = 1
  elif size < 0x10000:
    count = 2
  elif size < 0x100000000L:
    count = 4
  else:
    count = 8
  assert count <= 4, 'font files have at most 4 byte sizes'
  return count


def length_to_bits(size):
  count = how_many_bytes(size)
  bin_size = pack('>L', size)[-count:]
  assert len(bin_size) == count
  return (count, bin_size)


def byte_operator(operation, count):
  assert count in [1, 2, 4], 'invalid count'
  # instead of using costly log operation
  return chr(OPERATORS[operation] | LOGARITHM_BASE2[count])


class RleFont(object):
  """Running Length Encoding of the given file"""

  def __init__(self, filename):
    file_p = open(filename, 'rb')
    self.file_bytes = bytearray(file_p.read())
    file_p.close()
    self.encoded_bytes = bytearray()
    self.position = 0

  def _copy(self, end_pos):
    copy_size = end_pos - self.position
    count, bin_size = length_to_bits(copy_size)
    byte_op = byte_operator('copy', count)
    self.encoded_bytes.extend(byte_op)
    self.encoded_bytes.extend(bin_size)
    self.encoded_bytes.extend(self.file_bytes[self.position:end_pos])
    self.position = end_pos

  def _fill(self, repeat_len, fill_byte):
    count, bin_size = length_to_bits(repeat_len)
    byte_op = byte_operator('fill', count)
    self.encoded_bytes.extend(byte_op)
    self.encoded_bytes.extend(bin_size)
    self.encoded_bytes.extend(chr(fill_byte))
    self.position += repeat_len

  def encode(self):
    assert self.position == 0, 'Do not call encode twice'
    repeats = self.find_repeats()
    total_size = len(self.file_bytes)
    self.encoded_bytes.extend(pack('>L', total_size))
    for repeat in repeats:
      repeat_start, repeat_len, fill_byte = repeat
      # check if copy is needed
      if repeat_start > self.position:
        self._copy(repeat_start)
      self._fill(repeat_len, fill_byte)

    if total_size > self.position:
      self._copy(total_size)
    assert self.position == total_size, 'file could not parsed completely'

  def find_repeats(self):
    repeats = []
    repeat_start = 0
    prev_byte = None
    len_bytes = len(self.file_bytes)
    for i in range(len_bytes):
      cur_byte = self.file_bytes[i]
      # In a repeat.
      if cur_byte == prev_byte:
        continue
      # Not in a repeat
      repeat_len = i - repeat_start
      # The minimum RLE fill overhead is:
      # 1 byte - op_code
      # 1 byte - fill value
      # 1 byte - length
      # Note: shorter versions are possible.
      # It might be worthwhile to handle the shorter versions but it seems
      # unlikely there will be much actual gain.
      if repeat_len > 3:
        repeat_tuple = (repeat_start, repeat_len, prev_byte)
        repeats.append(repeat_tuple)
      prev_byte = cur_byte
      repeat_start = i

    # Close any last repeat
    repeat_len = len_bytes - repeat_start
    if repeat_len > 3:
      repeat_tuple = (repeat_start, repeat_len, prev_byte)
      repeats.append(repeat_tuple)

    return repeats

  def write(self, output):
    file_p = open(output, 'wb')
    file_p.write(self.encoded_bytes)
    file_p.close()


if __name__ == '__main__':
  print 'args', sys.argv[1]
  filename = sys.argv[1]
  rle = RleFont(filename)
  repeats = rle.find_repeats()
  rle.encode()
  rle.write(filename + '.rle')
